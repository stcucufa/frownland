import { extend } from "../util.js";
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
                (thread, vm) => TODO
            ]);
        }
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        if (time.cmp(t, end) > 0) {
            if (time.isUnresolved(t) && time.isDefinite(end)) {
                thread.ops.push([
                    (thread, vm) => { vm.scheduleForward(thread, end); },
                    (thread, vm) => TODO
                ]);
            }
            t = end;
        } else if (time.isDefinite(this.modifiers?.dur)) {
            t = end;
            thread.ops.push([
                (thread, vm) => { vm.scheduleForward(thread, end); },
                (thread, vm) => TODO
            ]);
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
