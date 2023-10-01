import { notify, on } from "../events.js";
import { create, del, nop } from "../util.js";
import { Clock } from "./clock.js";
import { generate, Thread, Threads } from "./thread.js";
import * as time from "../timing/time.js";

const [DO, UNDO, REDO] = [0, 1, 2];

export const Timeout = Symbol.for("timeout");

const proto = {
    init() {
        this.clock = Clock();
        this.resolvedTimes = new Map();
        this.threads = Threads();
        on(this.clock, "update", this);
    },

    // Schedule a thread for a new item.
    add(item, t = 0) {
        console.assert(time.isResolved(t));
        if (t < this.clock.now) {
            return;
        }
        return this.threads.scheduleForward(generate(item, t), t, 0);
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
            this.runForward(Object.getPrototypeOf(thread));
        }
        delete this.forward;
    },

    // Run a thread forward until the end, or until it yields.
    runForward(thread) {
        const i = thread.t < this.t ? DO : REDO;
        const n = thread.ops.length;
        while (this.pc < n) {
            const op = thread.ops[this.pc++];
            if (Array.isArray(op)) {
                try {
                    op[i](thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
                if (this.yielded) {
                    if (this.t > thread.t) {
                        thread.t = this.t;
                    }
                    delete this.yielded;
                    return;
                }
            } else {
                op.value = thread.value;
                const pc = this.pc;
                this.pc = 0;
                this.runForward(op);
                this.pc = pc;
            }
        }
        thread.end = thread.t = this.t;
        console.assert(this.pc === thread.ops.length);
        if (!thread.transient) {
            this.threads.scheduleBackward(thread, this.t, this.pc);
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
        while (this.pc > 0) {
            const op = thread.ops[--this.pc];
            if (Array.isArray(op)) {
                try {
                    op[UNDO](thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
                if (this.yielded) {
                    delete this.yielded;
                    return;
                }
            } else {
                const pc = this.pc;
                this.pc = 0;
                this.runBackward(op);
                this.pc = pc;
            }
        }
        console.assert(this.pc === 0);
        this.threads.scheduleForward(thread, this.t, this.pc);
    },

    // Schedule a thread forward in time. If the time is not definite, the
    // thread is simply suspended; in case of unresolved time, it may be
    // rescheduled later.
    schedule(thread, t) {
        this.yielded = true;
        if (time.isDefinite(t)) {
            this.threads.scheduleForward(thread, t, this.pc);
        } else {
            // Keep track of the position at which the thread was suspended.
            thread.suspended = this.pc;
        }
        this.threads.scheduleBackward(thread, this.t, this.pc - 1);
    },

    // Wake a suspended thread.
    wake(thread) {
        console.assert(thread.suspended);
        this.threads.scheduleForward(thread, this.t, del(thread, "suspended"));
    },

    // Schedule a thread to wait for a promise to be resolved. A notification
    // is sent on resolution.
    then(thread, promise) {
        this.yielded = true;
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
                        thread.t = thread.end;
                        thread.value = Timeout;
                        this.threads.scheduleForward(thread, thread.end, pc);
                        this.threads.scheduleBackward(thread, t, pc - 1);
                    }
                }]],
                transient: true
            });
            this.threads.scheduleForward(timeout, thread.end, 0);
        }
        promise.then(value => {
            const now = this.clock.now;
            if (time.cmp(now, thread.end) <= 0) {
                done = true;
                thread.value = value;
                this.threads.scheduleForward(thread, time.isDefinite(thread.end) ? thread.end : now, pc);
                this.threads.scheduleBackward(thread, t, pc - 1);
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
            this.threads.scheduleForward(thread, this.t, this.pc + 1);
        }
    },
};

export const VM = () => create().call(proto);
