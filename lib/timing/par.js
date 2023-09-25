import { extend, K, nop, push } from "../util.js";
import { generate } from "../runtime/thread.js";
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
            thread.ops.push([
                (thread, vm) => { vm.timeout(thread, end); },
                (thread, vm) => TODO
            ]);
        }
        thread.ops.push([
            nop,
            (thread, vm) => { vm.scheduleBackward(thread, begin); }
        ]);
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, generate(wrap(child), begin));
                t = time.max(t, childThread.end);
                childThread.end = t;
                childThread.ops.push([
                    thread => {
                        if (!thread.canRedo) {
                            accumulator[i] = thread.value;
                        }
                    },
                    nop
                ]);
                thread.timeline.push(childThread);
                return t;
            }, t
        );
        if (time.cmp(t, begin) > 0) {
            const scheduledEnd = time.isDefinite(this.modifiers?.dur) && time.cmp(end, t) > 0 ? end : t;
            thread.ops.push([
                (thread, vm) => { vm.scheduleForward(thread, scheduledEnd); },
                nop
            ]);
            t = scheduledEnd;
        }
        thread.ops.push([
            thread => { thread.value = accumulator; },
            thread => { thread.undo(); },
        ]);
        if (time.cmp(t, end) > 0) {
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
