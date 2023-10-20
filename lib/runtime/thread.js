import { create, extend, nop } from "../util.js";
import { Queue } from "../priority-queue.js";
import * as time from "../timing/time.js";

// Ops have three behaviours depending on whether we are in do, undo or redo
// execution mode.
export const [Do, Undo, Redo] = [0, 1, 2];

// Generate a thread for an item, setting its begin/end.
export function generate(item, begin, items) {
    if (!items.has(item)) {
        items.set(item, [new Set(), new Set()]);
    }
    const thread = Object.assign(Thread(), { item, begin });
    thread.end = item.generate(thread, begin, items);
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

    cancel() {
        console.assert(!this.ended);
        this.cancelled = true;
        for (const child of this.ops) {
            child.cancel?.();
        }
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

export const Thread = () => extend(thread, { id: ID++, ops: [], timeline: [], values: [], vp: 0 });

const threads = {
    init() {
        this.futureQueue = Queue((a, b) => time.cmp(a.t, b.t) || (order(b) - order(a)));
        this.pastQueue = Queue((a, b) => time.cmp(b.t, a.t) || (order(a) - order(b)));
        this.schedule = new Map();
    },

    get hasFuture() {
        return this.futureQueue.length > 0;
    },

    get nextFutureTime() {
        return this.futureQueue[0].t;
    },

    get nextFutureThread() {
        const thread = this.futureQueue.remove();
        if (thread.executionMode === Do) {
            const key = Object.getPrototypeOf(thread);
            console.assert(this.schedule.get(key) === thread);
            this.schedule.delete(key);
        }
        return thread;
    },

    scheduleForward(thread, t, pc = 0, executionMode = Do) {
        if (time.isDefinite(t)) {
            if (time.cmp(t, thread.end) <= 0) {
                const scheduled = this.futureQueue.insert(extend(thread, { t, pc, executionMode }));
                if (executionMode === Do) {
                    this.schedule.set(thread, scheduled);
                }
            }
        }
        return thread;
    },

    // Attempt to reschedule a thread if it is scheduled for a later time.
    didReschedule(thread, t, pc) {
        if (this.schedule.has(thread)) {
            const scheduled = this.schedule.get(thread);
            if (scheduled.t > t) {
                this.schedule.delete(thread);
                scheduled.rescheduled = true;
            } else {
                return false;
            }
        }
        delete thread.suspended;
        this.scheduleForward(thread, t, pc);
        return true;
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

const order = thread => thread.item?.order ?? thread.order;

export const Threads = () => create().call(threads);
