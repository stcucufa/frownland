import { extend, nop } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Seq",

    dur,

    // Generate code for the children, keeping track of time along the way. Set
    // the end if the dur modifier is set.
    generate(thread, t) {
        const pc = thread.ops.length;
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        const dur = this.modifiers?.dur;
        const end = time.add(t, dur ?? time.unresolved);
        if (time.isDefinite(end)) {
            // Reserve space for the cutoff thread.
            thread.ops.push([nop, nop, nop]);
        }
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        // A delay may be needed to ensure that the duration is extended.
        if (time.isDefinite(end)) {
            if (time.isUnresolved(t) || end > t) {
                thread.ops.push([
                    (thread, vm) => { vm.schedule(thread, vm.t + dur); },
                    (thread, vm) => { vm.yield(thread); },
                    (thread, vm) => { vm.yield(thread); },
                ]);
            }
            if (time.cmp(t, end) > 0) {
                // Thread may need to be cutoff, so schedule a cutoff thread
                // at the beginning.
                const to = thread.ops.length;
                thread.ops[pc][0] = (_, vm) => { vm.cutoff(thread, dur, pc + 1, to); };
            }
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
