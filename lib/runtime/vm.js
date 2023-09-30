import { on } from "../events.js";
import { create, nop } from "../util.js";
import { Clock } from "./clock.js";
import { generate, Thread, Threads } from "./thread.js";
import * as time from "../timing/time.js";

const [DO, UNDO, REDO] = [0, 1, 2];

export const Forward = true;
export const Backward = false;

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
        console.log(`> Update [${from}, ${to}[`);
        while (this.threads.hasFuture && this.threads.nextFutureTime < to) {
            const thread = this.threads.futureQueue.remove();
            this.t = thread.t;
            this.pc = thread.pc;
            this.runForward(Object.getPrototypeOf(thread));
        }
    },

    // Run a thread forward until the end, or until it yields.
    runForward(thread) {
        const i = thread.t < this.t ? DO : REDO;
        const n = thread.ops.length;
        while (this.pc < n) {
            console.log(
                `> [${thread.id}] ${this.t}/${this.pc}`, thread.ops[this.pc][i] ?? thread.ops[this.pc]
            );
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
        this.threads.scheduleBackward(thread, this.t, this.pc);
    },

    // Schedule a thread forward in time, possibly resolving an unresolved time.
    schedule(thread, t, u) {
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
                this.threads.scheduleForward(thread, resolved, this.pc);
                this.threads.scheduleBackward(thread, this.t, this.pc - 1);
            } else if (this.resolvedTimes.has(t)) {
                // This time was resolved so we can schedule normally.
                this.threads.scheduleForward(thread, this.resolvedTimes.get(t), this.pc);
                this.threads.scheduleBackward(thread, this.t, this.pc - 1);
            }
        } else {
            // Definite time, can schedule normally. Indefinite times are
            // ignored and the thread is simply discarded.
            if (time.isDefinite(t)) {
                this.threads.scheduleForward(thread, t, this.pc);
                this.threads.scheduleBackward(thread, this.t, this.pc - 1);
            }
            if (u && !(t instanceof Set)) {
                // This unresolved time just became resolved.
                this.resolvedTimes.set(u, t);
            }
        }
    },

    yield(thread, forward) {
        this.yielded = true;
        if (forward) {
            this.threads.scheduleBackward(thread, this.t, this.pc - 1);
        } else {
            this.threads.scheduleForward(thread, this.t, this.pc + 1);
        }
    },

    updateBackward(from, to) {
        if (!this.threads.hasPast) {
            return;
        }
        console.assert(this.threads.nextPastTime < from);
        console.log(`< Update ]${from}, ${to}]`);
        while (this.threads.hasPast && this.threads.nextPastTime >= to) {
            const thread = this.threads.pastQueue.remove();
            this.t = thread.t;
            this.pc = thread.pc;
            this.runBackward(Object.getPrototypeOf(thread));
        }
    },

    runBackward(thread) {
        while (this.pc > 0) {
            const op = thread.ops[--this.pc];
            console.log(
                `< [${thread.id}] ${this.t}/${this.pc}`, thread.ops[this.pc][UNDO] ?? thread.ops[this.pc]
            );
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
};

export const VM = () => create().call(proto);
