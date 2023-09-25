import { extend, nop } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Seq",

    dur,

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        let end = Infinity;
        if (time.isDefinite(this.modifiers?.dur)) {
            end = t + this.modifiers.dur;
            thread.ops.push([
                (thread, vm) => { vm.timeout(thread, end); },
                nop,
            ]);
        }
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        const from = t;
        if (time.cmp(t, end) > 0) {
            if (time.isUnresolved(t) && time.isDefinite(end)) {
                thread.ops.push([
                    (thread, vm) => { vm.scheduleForward(thread, end); },
                    nop
                ]);
                thread.ops.push([
                    nop,
                    (thread, vm) => { vm.scheduleForward(thread, from); },
                ]);
            }
            t = end;
        } else if (time.isDefinite(this.modifiers?.dur)) {
            thread.ops.push([
                (thread, vm) => { vm.scheduleForward(thread, end); },
                nop,
            ]);
            thread.ops.push([
                nop,
                (thread, vm) => { vm.scheduleForward(thread, from); },
            ]);
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
