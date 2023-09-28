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

        // Generate threads for children and track the maximum end time. When a
        // thread ends, it pushes its value to the accumulator.
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, generate(wrap(child), begin));
                t = time.max(t, childThread.end);
                childThread.ops.push([
                    thread => { accumulator[i] = thread.value; },
                    nop,
                    nop
                ]);
                thread.timeline.push(childThread);
                return t;
            }, t
        );

        // Non-zero duration par needs a delay to the end of child ending last.
        if (time.cmp(t, begin) > 0) {
            const scheduledEnd = time.isDefinite(this.modifiers?.dur) && time.cmp(end, t) > 0 ? end : t;
            thread.ops.push([
                (thread, vm) => { vm.schedule(thread, scheduledEnd); },
                (thread, vm) => { vm.yield(thread, false); },
                (thread, vm) => { vm.yield(thread, true); },
            ]);
            t = scheduledEnd;
        }

        // Set the value of the thread to the accumulator.
        thread.ops.push([
            thread => { thread.value = accumulator; },
            thread => { thread.undo(); },
            thread => { thread.redo(); }
        ]);

        if (time.cmp(t, end) > 0) {
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
