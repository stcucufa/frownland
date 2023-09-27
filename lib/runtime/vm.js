import { on } from "../events.js";
import { create, nop } from "../util.js";
import { Clock } from "./clock.js";
import { generate, Thread, Threads } from "./thread.js";
import * as time from "../timing/time.js";

const [DO, UNDO, REDO] = [0, 1, 2];

const proto = {
    init() {
        this.clock = Clock();
        this.resolvedTimes = new Map();
        this.threads = Threads();
        on(this.clock, "update", this);
    },

    // Schedule a thread for a new item.
    add(item, t = 0) {
        console.assert(!time.isUnresolved(t));
        if (t < this.clock.now) {
            return;
        }
        return this.threads.scheduleForward(generate(item, t), t);
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
        while (this.threads.hasFuture && this.threads.nextFutureTime < to) {
            const thread = this.threads.futureQueue.remove();
            this.t = thread.t;
            this.runForward(Object.getPrototypeOf(thread));
        }
    },

    // Run a thread forward until the end, or until it yields.
    runForward(thread) {
        for (const n = thread.timeout ?? thread.ops.length; thread.pc < n;) {
            const op = thread.ops[thread.pc++];
            if (Array.isArray(op)) {
                try {
                    op[thread.t < this.t ? DO : REDO](thread, this);
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
                this.runForward(op);
            }
        }
        thread.end = thread.t = this.t;
        this.threads.scheduleBackward(thread, this.t);
    },

    // Schedule a thread forward in time, possibly resolving an unresolved time.
    schedule(thread, t, unresolvedTime) {
        this.yielded = true;
        if (thread.t > this.t) {
            return;
        }

        // Mark thread progress to this point.
        thread.t = this.t;
        if (time.isUnresolved(t)) {
            if (t instanceof Set) {
                // Check if all unresolved times have been resolved, in which
                // case the resolved time is the max of all resolved times.
                console.assert(t.size >= 2);
                let resolved = -Infinity;
                for (const u of t) {
                    if (!this.resolvedTimes.has(u)) {
                        return;
                    }
                    resolved = Math.max(resolved, this.resolvedTimes.get(u));
                }
                this.threads.scheduleForward(thread, resolved);
                this.threads.scheduleBackward(thread, this.t);
            } else if (this.resolvedTimes.has(t)) {
                // This time was resolved so we can schedule normally.
                this.threads.scheduleForward(thread, this.resolvedTimes.get(t));
                this.threads.scheduleBackward(thread, this.t);
            }
        } else {
            // Definite time, can schedule normally. Indefinite times are
            // ignored and the thread is simply discarded.
            if (time.isDefinite(t)) {
                this.threads.scheduleForward(thread, t);
                this.threads.scheduleBackward(thread, this.t);
            }
            if (unresolvedTime && !(t instanceof Set)) {
                // This unresolved time just became resolved.
                this.resolvedTimes.set(unresolvedTime, t);
            }
        }
    },

    updateBackward(from, to) {
        if (!this.threads.hasPast) {
            return;
        }
        console.assert(this.threads.nextPastTime < from);
        while (this.threads.hasPast && this.threads.nextPastTime >= to) {
            const thread = this.threads.pastQueue.remove();
            this.t = thread.t;
            this.runBackward(Object.getPrototypeOf(thread));
        }
    },

    runBackward(thread) {
        while (thread.pc > 0) {
            const op = thread.ops[--thread.pc];
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
                console.assert(time.isDefinite(op.end) && op.end <= this.t);
                if (op.end === this.t) {
                    this.runBackward(op);
                } else {
                    this.scheduleBackward(op, op.end);
                }
            }
        }
        this.threads.scheduleForward(thread, this.t);
    },

    // Set a timeout for a thread.
    timeout(thread, t) {
        const timeoutThread = Thread();
        timeoutThread.ops.push([
            () => {
                if (!Object.hasOwn(thread, "timeout")) {
                    thread.timeout = thread.pc;
                }
            },
            nop
        ]);
        this.threads.scheduleForward(timeoutThread, t);
    },
};

export const VM = () => create().call(proto);
