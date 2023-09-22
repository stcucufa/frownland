import { on } from "../events.js";
import { create, mapdel } from "../util.js";
import { Queue } from "../priority-queue.js";
import { Clock } from "./clock.js";
import { Thread } from "./thread.js";
import * as time from "../timing/time.js";

const proto = {
    init() {
        this.clock = Clock();
        this.resolvedTimes = new Map();
        this.futureTimes = new Map();
        this.futureQueue = Queue((a, b) => time.cmp(this.futureTimes.get(a), this.futureTimes.get(b)));
        on(this.clock, "update", this);
    },

    handleEvent({ from, to }) {
        if (this.futureQueue.length === 0) {
            return;
        }
        console.assert(this.futureTimes.get(this.futureQueue[0]) >= from);
        while (this.futureQueue.length > 0 && this.futureTimes.get(this.futureQueue[0]) < to) {
            const thread = this.futureQueue.remove();
            this.t = mapdel(this.futureTimes, thread);
            if (!Object.hasOwn(thread, "timeout")) {
                this.run(thread);
            }
        }
    },

    add(item, t = 0) {
        console.assert(!time.isUnresolved(t));
        if (t < this.clock.now) {
            return;
        }
        const thread = Object.assign(Thread(), { begin: t });
        thread.end = item.generate(thread, t);
        this.futureTimes.set(thread, t);
        return time.isDefinite(t) ? this.futureQueue.insert(thread) : thread;
    },

    schedule(thread, t, unresolvedTime) {
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
                this.futureTimes.set(thread, resolved);
                this.futureQueue.insert(thread);
            } else if (this.resolvedTimes.has(t)) {
                // This time was resolved so we can schedule normally.
                this.futureTimes.set(thread, this.resolvedTimes.get(t));
                this.futureQueue.insert(thread);
            }
        } else {
            // Definite time, can schedule normally. Indefinite times are
            // ignored and the thread is simply discarded.
            if (time.isDefinite(t)) {
                this.futureTimes.set(thread, t);
                this.futureQueue.insert(thread);
            }
            if (unresolvedTime && !(t instanceof Set)) {
                // This unresolved time just became resolved.
                this.resolvedTimes.set(unresolvedTime, t);
            }
        }
    },

    // Set a timeout for a thread.
    timeout(thread, t) {
        const timeoutThread = Thread();
        timeoutThread.ops.push(() => {
            if (this.futureTimes.has(thread)) {
                thread.timeout = t;
            }
        });
        this.futureTimes.set(timeoutThread, t);
        this.futureQueue.insert(timeoutThread);
    },

    run(thread) {
        while (thread.pc < thread.ops.length) {
            const op = thread.ops[thread.pc++];
            if (typeof op === "function") {
                try {
                    op(thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
                if (this.yielded) {
                    delete this.yielded;
                    return;
                }
            } else {
                op.value = thread.value;
                this.run(op);
            }
        }
    }
};

export const VM = () => create().call(proto);
