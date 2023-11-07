import { notify, off, on } from "../events.js";
import { add, clamp, create, everyof, foldit, nop } from "../util.js";
import { Clock } from "./clock.js";
import { generate, spawn, Thread, Threads, Do, Undo, Redo } from "./thread.js";
import * as time from "../timing/time.js";

// Unique value for timeouts.
export const Timeout = Symbol.for("timeout");

const proto = {

    // Init a new VM with a clock and threads manager.
    init() {
        this.threads = Threads();
        this.clock = Clock();
        on(this.clock, "update", this);
        this.ramps = new Map();
        this.listeners = new Set();

        // Graph representation: map each item to [incoming, outgoing, order]
        this.items = new Map();
    },

    // Start the clock and return self.
    start() {
        this.clock.start();
        return this;
    },

    // Stop completely, clearing remaining event listeners.
    shutdown() {
        off(this.clock, "update", this);
        this.clock.stop();
        delete this.clock;
        delete this.threads;
        for (const [item, handler] of this.listeners) {
            item.target.removeEventListener(item.type, handler);
        }
        delete this.listeners;
        delete this.inputs;
        delete this.items;
    },

    // Schedule a thread for a new item, now by default or at a later time.
    add(item, t) {
        t ??= this.clock.now;
        console.assert(time.isResolved(t));
        if (t < this.clock.now) {
            return;
        }
        const thread = this.threads.scheduleForward(generate(item, t, this.items), t);
        this.sortGraph();
        return thread;
    },

    // Sort items in topological order.
    sortGraph() {
        const items = foldit(this.items.entries(), (items, [item, [incoming]]) => {
            if (incoming.size === 0) {
                item.order = items.length;
                items.push(item);
            }
            return items;
        }, []);
        const sorted = new Set(items);
        const seen = new Set();
        const queue = items.slice();
        while (queue.length > 0) {
            const item = queue.shift();
            if (seen.has(item)) {
                throw new window.Error("Cycle detected");
            }
            seen.add(item);
            for (const it of this.items.get(item)[1]) {
                if (everyof(this.items.get(it)[0], i => sorted.has(i))) {
                    it.order = items.length;
                    sorted.add(it);
                    items.push(it);
                }
                queue.push(it);
            }
        }
    },

    // Update forward or backward.
    handleEvent({ from, to }) {
        if (from < to) {
            this.updateForward(from, to);
        } else {
            console.assert(from > to);
            this.updateBackward(from, to);
        }
    },

    // Run updates forward (do/redo).
    updateForward(from, to) {
        if (!this.threads.hasFuture) {
            return;
        }
        console.assert(this.threads.nextFutureTime >= from);
        this.forward = true;
        this.intervalEnd = to;
        while (this.threads.hasFuture && this.threads.nextFutureTime < to) {
            const thread = this.threads.nextFutureThread;
            if (thread.rescheduled) {
                continue;
            }
            this.t = thread.t;
            this.pc = thread.pc;
            this.runForward(Object.getPrototypeOf(thread), thread.executionMode);
        }
        for (const [thread, ramp] of this.ramps.entries()) {
            console.assert(to < ramp.end);
            const p = clamp((to - ramp.begin) / ramp.dur, 0, 1);
            const value = ramp.f(thread.value, p, to);
            thread.rampDidProgress?.(value);
            // Schedule the thread for the next update, restoring the pc to the
            // first ramp op to keep ramping.
            thread.suspended = this.pc - 1;
            this.threads.scheduleForward(thread, to, this.pc - 1);
        }
        delete this.intervalEnd;
        delete this.forward;
    },

    // Run a thread forward until the end, or until it yields, doing or redoing
    // depending on the execution mode.
    runForward(thread, executionMode) {
        if (thread.cancelled) {
            return;
        }

        const n = thread.ops.length;
        const childThreads = [];
        while (this.pc < n && !this.yielded) {
            const op = thread.ops[this.pc++];
            if (Array.isArray(op)) {
                try {
                    op[executionMode](thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
            } else if (executionMode === Do) {
                const childThread = spawn(thread, op, this.t);
                thread.childThreads.add(childThread);
                childThreads.push(childThread);
                thread.parState.children.add(childThread);
            }
        }

        if (this.yielded) {
            // The thread was suspended.
            delete this.yielded;
        } else {
            // The thread reached its end.
            console.assert(this.pc === thread.ops.length);
            thread.effectiveEnd = this.t;
            thread.ended = true;
            if (!(n === 1 && thread.ops[0].length === 1)) {
                // Timeout threads have only one execution mode per op (i.e.,
                // no Undo or Redo) and should not be scheduled backward.
                this.threads.scheduleBackward(thread, this.t, this.pc);
            }
        }

        // Spawn child threads.
        for (const childThread of childThreads) {
            childThread.value = thread.value;
            this.pc = 0;
            this.runForward(childThread, Do);
        }
    },

    // Run updates backward (undo).
    updateBackward(from, to) {
        if (!this.threads.hasPast) {
            return;
        }
        console.assert(this.threads.nextPastTime < from);
        while (this.threads.hasPast && this.threads.nextPastTime >= to) {
            const thread = this.threads.pastQueue.remove();
            this.t = thread.t;
            this.pc = thread.pc;
            this.runBackward(Object.getPrototypeOf(thread));
        }
    },

    // Run a thread backward to the beginning, or until it yields.
    runBackward(thread) {
        while (this.pc > 0 && !this.yielded) {
            const op = thread.ops[--this.pc];
            if (Array.isArray(op)) {
                try {
                    op[Undo](thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
            }
        }

        if (this.yielded) {
            delete this.yielded;
        } else {
            console.assert(this.pc === 0);
            this.threads.scheduleForward(thread, this.t, this.pc, Redo);
        }
    },

    // Schedule a thread forward in time. If the time is not definite, the
    // thread is simply suspended; in case of unresolved time, it may be
    // rescheduled later.
    schedule(thread, t) {
        this.yielded = true;
        // Keep track of the position at which the thread was suspended.
        thread.suspended = this.pc;
        if (time.isDefinite(t)) {
            this.threads.scheduleForward(thread, t, this.pc);
        }
        this.threads.scheduleBackward(thread, this.t, this.pc - 1);
    },

    // Handle ramps: begin, keep going, or end, depending on where we are in
    // the interval.
    ramp(thread, f, dur) {
        const rampDidBegin = !this.ramps.has(thread);
        if (rampDidBegin) {
            // Begin the ramp.
            this.ramps.set(thread, { f, begin: this.t, end: this.t + dur, dur });
        }
        const end = this.ramps.get(thread).end;
        if (end > this.intervalEnd) {
            // Keep the ramp going; its function will be evaluated at the end
            // of the interval.
            this.yielded = true;
        } else {
            // The end point is within this interval but it still needs to be
            // scheduled to happen at the right time.
            this.schedule(thread, end);
        }
        return rampDidBegin;
    },

    // Actually end ramping in a thread, calling its f function with p=1.
    endRamp(thread, f) {
        console.assert(this.ramps.has(thread));
        this.ramps.delete(thread);
        const value = f(thread.value, 1, this.t);
        thread.rampDidProgress?.(value);
    },

    // Cutoff a thread after a duration, cancelling all subthreads in the
    // [from, to] range of ops.
    cutoff(thread, dur, from, to) {
        this.threads.scheduleForward(Object.assign(Thread(), {
            order: thread.item.order + 0.5,
            ops: [[(_, vm) => {
                if (this.threads.didReschedule(thread, vm.t, to, Do)) {
                    for (let i = from; i < to; ++i) {
                        thread.ops[i].cancel?.();
                    }
                }
            }]]
        }), this.t + dur);
    },

    // Wake a suspended thread.
    wake(thread, t) {
        this.threads.wake(thread, t ?? this.t);
    },

    // Schedule a thread to wait for an event to occur. A notification is sent.
    listen(thread, item, dur) {
        this.schedule(thread, time.unresolved);
        const begin = this.t;
        const end = time.add(begin, dur);
        const pc = this.pc;
        const vp = thread.vp;
        const handler = event => {
            const now = this.clock.now;
            if (time.cmp(now, end) <= 0) {
                console.assert(vp === thread.vp);
                item.target.removeEventListener(item.type, handler);
                this.listeners.delete(listener);
                thread.listeners.delete(listener);
                if (item.modifiers?.preventDefault) {
                    event.preventDefault();
                }
                if (item.modifiers?.stopImmediatePropagation) {
                    event.stopImmediatePropagation();
                }
                if (item.modifiers?.stopPropagation) {
                    event.stopPropagation();
                }
                thread.value = event;
                this.wake(thread, time.isResolved(end) ? end : now);
            }
            notify(this, "event", { thread, event });
        };
        const listener = add(this.listeners, [item, handler]);
        thread.listeners.add(listener);
        if (time.isDefinite(end)) {
            // Set a timeout thread
            const timeout = Object.assign(Thread(), {
                order: thread.item.order + 0.5,
                begin,
                end,
                ops: [[() => {
                    if (vp === thread.vp) {
                        item.target.removeEventListener(item.type, handler);
                        this.listeners.delete(listener);
                        thread.listeners.delete(listener);
                        thread.value = Timeout;
                        this.threads.scheduleForward(thread, end, pc);
                    }
                }]]
            });
            this.threads.scheduleForward(timeout, end);
        }
        item.target.addEventListener(item.type, handler);
    },

    // Cancel a thread, its event listeners, and its potential current ramp.
    cancelThread(thread) {
        if (!thread.ended) {
            thread.cancelled = true;
            for (const listener of thread.listeners) {
                const [item, handler] = listener;
                item.target.removeEventListener(item.type, handler);
                this.listeners.delete(listener);
            }
            for (const childThread of thread.childThreads) {
                this.cancelThread(childThread);
            }
            this.ramps.delete(thread);
        }
    },

    // Schedule a thread to wait for a promise to be resolved. A notification
    // is sent on resolution.
    then(thread, promise) {
        this.schedule(thread, time.unresolved);
        const t = this.t;
        const pc = this.pc;
        if (typeof promise?.then !== "function") {
            throw Error("invalid value for await (not a thenable)", { promise });
        }
        let done = false;
        if (time.isDefinite(thread.end)) {
            // Set a timeout thread
            const timeout = Object.assign(Thread(), {
                order: thread.item.order + 0.5,
                begin: t,
                end: thread.end,
                ops: [[() => {
                    if (!done) {
                        done = true;
                        thread.value = Timeout;
                        this.threads.scheduleForward(thread, thread.end, pc);
                    }
                }]]
            });
            this.threads.scheduleForward(timeout, thread.end);
        }
        promise.then(value => {
            const now = this.clock.now;
            if (!done && time.cmp(now, thread.end) <= 0) {
                done = true;
                thread.value = value;
                this.wake(thread, time.isResolved(thread.end) ? thread.end : now);
            }
            notify(this, "promise", { thread, value });
        });
    },

    // Yield a thread forward or backward (for redo/undo).
    yield(thread) {
        this.yielded = true;
        if (this.forward) {
            this.threads.scheduleBackward(thread, this.t, this.pc - 1);
        } else {
            this.threads.scheduleForward(thread, this.t, this.pc + 1, Redo);
        }
    },
};

export const VM = () => create().call(proto);
