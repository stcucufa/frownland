import { create, extend, mapdel } from "../util.js";
import { Queue } from "../priority-queue.js";
import * as time from "../timing/time.js";

const thread = {
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

export const Thread = () => extend(thread, { ops: [], timeline: [], pc: 0 });

const threads = {
    init() {
        this.futureTimes = new Map();
        this.futureQueue = Queue((a, b) => time.cmp(this.futureTimes.get(a), this.futureTimes.get(b)));
        this.pastTimes = new Map();
        this.pastQueue = Queue((a, b) => time.cmp(this.pastTimes.get(b), this.pastTimes.get(a)));
    },

    get hasFuture() {
        return this.futureQueue.length > 0;
    },

    get nextFutureTime() {
        return this.futureTimes.get(this.futureQueue[0]);
    },

    isScheduledForward(thread) {
        return this.futureTimes.has(thread);
    },

    get scheduledForward() {
        const thread = this.futureQueue.remove();
        const t = mapdel(this.futureTimes, thread);
        return [thread, t];
    },

    scheduleForward(thread, t) {
        this.futureTimes.set(thread, t);
        if (time.isDefinite(t)) {
            this.futureQueue.insert(thread);
        }
        return thread;
    },

    get hasPast() {
        return this.pastQueue.length > 0;
    },

    isScheduledBackward(thread) {
        return this.pastTimes.has(thread);
    },

    get scheduledBackward() {
        const thread = this.pastQueue.remove();
        const t = mapdel(this.pastTimes, thread);
        return [thread, t];
    },

    scheduleBackward(thread, t) {
        this.pastTimes.set(thread, t);
        this.pastQueue.insert(thread);
        return thread;
    }
};

export const Threads = () => create().call(threads);
