import { on } from "../events.js";
import { create } from "../util.js";
import { Clock } from "./clock.js";
import { Thread, Threads } from "./thread.js";
import * as time from "../timing/time.js";

const proto = {
    init() {
        this.clock = Clock();
        this.resolvedTimes = new Map();
        this.threads = Threads();
        on(this.clock, "update", this);
    },

    handleEvent({ from, to }) {
        if (from < to) {
            this.updateForward(from, to);
        } else {
            this.updateBackward(from, to);
        }
    },

    add(item, t = 0) {
        console.assert(!time.isUnresolved(t));
        if (t < this.clock.now) {
            return;
        }
        const thread = Object.assign(Thread(), { begin: t });
        thread.end = item.generate(thread, t);
        return this.threads.scheduleForward(thread, t);
    },

    scheduleForward(thread, t, unresolvedTime) {
        this.yielded = true;
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

    scheduleBackward(thread, t) {
        this.yielded = true;
        if (time.isUnresolved(t)) {
            TODO;
        } else {
            console.assert(time.isDefinite(t));
            this.threads.scheduleBackward(thread, t);
            this.threads.scheduleForward(thread, this.t);
        }
    },

    // Set a timeout for a thread.
    timeout(thread, t) {
        const timeoutThread = Thread();
        timeoutThread.ops.push([
            () => {
                if (!Object.hasOwn(thread, "timeout") && this.threads.isScheduledForward(thread)) {
                    thread.timeout = thread.pc;
                }
            },
            () => TODO
        ]);
        this.threads.scheduleForward(timeoutThread, t);
    },

    updateForward(from, to) {
        if (!this.threads.hasFuture) {
            return;
        }
        console.assert(this.threads.nextFutureTime >= from);
        while (this.threads.hasFuture && this.threads.nextFutureTime < to) {
            const [thread, t] = this.threads.scheduledForward;
            this.t = t;
            this.runForward(thread);
        }
    },

    runForward(thread) {
        for (const n = thread.timeout ?? thread.ops.length; thread.pc < n;) {
            const op = thread.ops[thread.pc++];
            if (Array.isArray(op)) {
                try {
                    op[0](thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
                if (this.yielded) {
                    delete this.yielded;
                    return;
                }
            } else {
                op.value = thread.value;
                this.runForward(op);
            }
        }
        thread.end = this.t;
        this.threads.scheduleBackward(thread, this.t);
    },

    updateBackward(from, to) {
        if (!this.threads.hasPast) {
            return;
        }
        console.assert(this.threads.nextPastTime < from);
        while (this.threads.hasPast && this.threads.nextPastTime >= to) {
            const [thread, t] = this.threads.scheduledBackward;
            this.t = t;
            this.runBackward(thread);
        }
    },

    runBackward(thread) {
        while (thread.pc > 0) {
            const op = thread.ops[--thread.pc];
            if (Array.isArray(op)) {
                try {
                    op[1](thread, this);
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
};

export const VM = () => create().call(proto);
