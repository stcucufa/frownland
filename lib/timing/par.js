import { extend, K, push } from "../util.js";
import { Thread } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",
    
    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const accumulator = [];
        const begin = t;
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, Thread());
                t = time.max(t, wrap(child).generate(childThread, begin));
                childThread.ops.push(thread => { accumulator[i] = thread.value; });
                thread.timeline.push(childThread);
                return t;
            }, t
        );
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        if (time.cmp(t, thread.t) > 0) {
            thread.ops.push((thread, vm) => { vm.schedule(thread, t); });
        }
        thread.ops.push(thread => { thread.value = accumulator; });
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
