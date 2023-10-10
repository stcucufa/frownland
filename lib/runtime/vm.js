import { notify, on } from "../events.js";
import { create, del, nop } from "../util.js";
import { Clock } from "./clock.js";
import { generate, Thread, Threads, Do, Undo, Redo } from "./thread.js";
import * as time from "../timing/time.js";

// Unique value for timeouts.
export const Timeout = Symbol.for("timeout");

const proto = {

    // Init a new VM with a clock and threads manager.
    init() {
        this.threads = Threads();
        this.clock = Clock();
        on(this.clock, "update", this);
    },

    // Schedule a thread for a new item.
    add(item, t = 0) {
        console.assert(time.isResolved(t));
        if (t < this.clock.now) {
            return;
        }
        return this.threads.scheduleForward(generate(item, t), t, 0, Do);
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
        while (this.threads.hasFuture && this.threads.nextFutureTime < to) {
            const thread = this.threads.futureQueue.remove();
            this.t = thread.t;
            this.pc = thread.pc;
            this.runForward(Object.getPrototypeOf(thread), thread.executionMode);
        }
        delete this.forward;
    },

    // Run a thread forward until the end, or until it yields. `i` is the index
    // (Do or Redo) of the op to actually run.
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
                childThreads.push(op);
            }
        }

        if (this.yielded) {
            // The thread was suspended.
            delete this.yielded;
        } else {
            // The thread reached its end.
            console.assert(this.pc === thread.ops.length);
            thread.end = this.t;
            thread.ended = true;
            if (thread.lastChildOf) {
                del(thread, "lastChildOf").cancelChildren();
            }
            if (!(n === 1 && thread.ops[0].length === 1)) {
                // Timeout threads have only one execution mode per op (i.e.,
                // no Undo or Redo) and should not be scheduled backward.
                this.threads.scheduleBackward(thread, this.t, this.pc);
            }
        }

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
            this.threads.scheduleForward(thread, t, this.pc, Do);
        }
        this.threads.scheduleBackward(thread, this.t, this.pc - 1);
    },

    // Wake a suspended thread.
    wake(thread, t) {
        console.assert(thread.suspended);
        this.threads.scheduleForward(thread, t ?? this.t, del(thread, "suspended"), Do);
    },

    // Schedule a thread to wait for an event to occur. A notification is sent.
    listen(thread, item) {
        this.schedule(thread, time.unresolved);
        const t = this.t;
        const pc = this.pc;
        let done = false;
        const handler = event => {
            const now = this.clock.now;
            if (time.cmp(now, thread.end) <= 0) {
                console.assert(done === false);
                done = true;
                item.target.removeEventListener(item.type, handler);
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
                this.wake(thread, time.isResolved(thread.end) ? thread.end : now);
            }
            notify(this, "event", { thread, event });
        };
        if (time.isDefinite(thread.end)) {
            // Set a timeout thread
            const timeout = Object.assign(Thread(), {
                begin: t,
                end: thread.end,
                ops: [[() => {
                    if (!done) {
                        done = true;
                        item.target.removeEventListener(item.type, handler);
                        thread.value = Timeout;
                        this.threads.scheduleForward(thread, thread.end, pc, Do);
                    }
                }]]
            });
            this.threads.scheduleForward(timeout, thread.end, 0, Do);
        }
        item.target.addEventListener(item.type, handler);
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
                begin: t,
                end: thread.end,
                ops: [[() => {
                    if (!done) {
                        done = true;
                        thread.value = Timeout;
                        this.threads.scheduleForward(thread, thread.end, pc, Do);
                    }
                }]]
            });
            this.threads.scheduleForward(timeout, thread.end, 0, Do);
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
