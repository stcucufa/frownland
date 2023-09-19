import { extend, K, push } from "../util.js";
import { Thread } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",

    dur,

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const accumulator = [];
        const begin = t;
        let end = Infinity;
        if (time.isDefinite(this.modifiers?.dur)) {
            end = t + this.modifiers.dur;
            thread.ops.push((thread, vm) => { vm.timeout(thread, end); });
        }
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, Thread());
                t = time.max(t, wrap(child).generate(childThread, begin));
                childThread.ops.push(thread => { accumulator[i] = thread.value; });
                thread.timeline.push(childThread);
                return t;
            }, t
        );
        if (time.cmp(t, thread.t) > 0) {
            const scheduledEnd = t;
            thread.ops.push((thread, vm) => { vm.schedule(thread, scheduledEnd); });
        }
        thread.ops.push(thread => { thread.value = accumulator; });
        if (time.cmp(t, end) > 0) {
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
