import { on } from "../events.js";
import { create, extend, get } from "../util.js";
import { Queue } from "../priority-queue.js";
import { Clock } from "./clock.js";
import * as time from "../timing/time.js";

export const Thread = () => ({ ops: [] });

const proto = {
    init() {
        this.clock = Clock();
        this.futureQueue = Queue(time.cmp);
        this.resolvedTimes = new Map();
        on(this.clock, "update", this);
    },

    handleEvent({ from, to }) {
        if (this.futureQueue.length === 0) {
            return;
        }
        console.assert(this.futureQueue[0].t >= from);
        while (this.futureQueue.length > 0 && this.futureQueue[0].t < to) {
            const thread = this.futureQueue.remove();
            this.run(thread);
        }
    },

    add(item, t = 0) {
        if (t < this.clock.now) {
            return;
        }
        const thread = Object.assign(Thread(), { t });
        thread.end = item.generate(thread, t);
        return this.futureQueue.insert(thread);
    },

    schedule(thread, t, unresolvedTime) {
        if (time.isUnresolved(t)) {
            if (this.resolvedTimes.has(t)) {
                // This time was resolved so we can schedule normally.
                thread.t = this.resolvedTimes.get(t);
                this.futureQueue.insert(thread);
            }
        } else {
            if (time.isDefinite(t)) {
                // Definite time, can schedule normally. Indefinite times are
                // ignored and the thread is simply discarded.
                thread.t = t;
                this.futureQueue.insert(thread);
            }
            if (unresolvedTime) {
                // This unresolved time just became resolved.
                this.resolvedTimes.set(unresolvedTime, t);
            }
        }
        this.yielded = true;
    },

    run(thread) {
        for (let i = thread.pc ?? 0; i < thread.ops.length; ++i) {
            const op = thread.ops[i];
            if (typeof op === "function") {
                try {
                    op(thread, this);
                } catch (error) {
                    console.warn(error.message ?? "Error", error);
                }
                if (this.yielded) {
                    thread.pc = i + 1;
                    delete this.yielded;
                    return;
                }
            } else {
                this.run(Object.assign(op, { value: thread.value, t: thread.t }));
            }
        }
    }
};

export const VM = () => create().call(proto);
