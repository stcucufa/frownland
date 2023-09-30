import { create, extend, nop } from "../util.js";
import { Queue } from "../priority-queue.js";
import * as time from "../timing/time.js";

// Generate a thread for an item, setting its begin/end.
export function generate(item, begin) {
    const thread = Object.assign(Thread(), { begin });
    thread.end = item.generate(thread, begin);
    return thread;
}

const thread = {
    get value() {
        return this.values[this.vp - 1];
    },

    set value(value) {
        this.values[this.vp++] = value;
        this.values.length = this.vp;
    },

    undo() {
        this.vp -= 1;
    },

    redo() {
        this.vp += 1;
    },

    get canRedo() {
        return this.vp < this.values.length;
    },

    dump(indent = "* ") {
        return this.timeline.map(
            (item, i) => item.tag ? `${i === 0 ? indent.replace(/\*/, "+") : indent}${
                time.show(item.t)
            }/${item.pc} ${
                item.begin ? "[begin] " : item.end ? "[end] " : ""
            }${item.show?.() ?? item.tag}` : item.dump(`    ${indent}`)
        ).join("\n");
    }
};

let ID = 0;

export const Thread = () => extend(thread, { id: ID++, ops: [], timeline: [], values: [], t: 0, vp: 0 });

const threads = {
    init() {
        this.futureQueue = Queue((a, b) => time.cmp(a.t, b.t));
        this.pastQueue = Queue((a, b) => time.cmp(b.t, a.t));
    },

    get hasFuture() {
        return this.futureQueue.length > 0;
    },

    get nextFutureTime() {
        return this.futureQueue[0].t;
    },

    scheduleForward(thread, t, pc) {
        if (time.isDefinite(t)) {
            if (time.cmp(t, thread.end) <= 0) {
                this.futureQueue.insert(extend(thread, { t, pc }));
            } else {
                // Thread is cutoff.
                thread.t = thread.end;
            }
        }
        return thread;
    },

    get hasPast() {
        return this.pastQueue.length > 0;
    },

    get nextPastTime() {
        return this.pastQueue[0].t;
    },

    scheduleBackward(thread, t, pc) {
        console.assert(time.isDefinite(t));
        return this.pastQueue.insert(extend(thread, { t, pc }));
    }
};

export const Threads = () => create().call(threads);
