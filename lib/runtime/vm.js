import { Queue } from "../priority-queue.js";
import { Clock } from "./clock.js";

export const Thread = () => ({ ops: [] });

const proto = {
    init() {
        this.clock = Clock();
        this.futureQueue = Queue((a, b) => a.t - b.t);
        on(this.clock, "update", this);
    },

    handleEvent({ from, to }) {
        if (this.futureQueue.length === 0) {
            return;
        }
        console.assert(this.futureQueue[0].t >= from);
        while (this.futureQueue[0].t < to) {
            const thread = this.futureQueue.pop();
            this.run(thread);
        }
    },

    add(item, t = 0) {
        if (t < this.clock.now) {
            return;
        }
        const thread = Object.assign(Thread(), { t });
        thread.end = item.generate(thread, t);
        return this.futureQueue.push(thread);
    },

    run(thread) {
        for (const op of thread.ops) {
            if (typeof op === "function") {
                op(thread);
            } else {
                op.value = thread.value;
                op.t = thread.t;
                this.run(op);
                thread.accumulator.push(op.value);
                delete op.value;
                delete op.t;
            }
        }
    }
};

export const VM = () => Object.create(proto);
