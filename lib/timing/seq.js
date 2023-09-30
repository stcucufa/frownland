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
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const end = time.add(t, this.modifiers?.dur);
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        if (time.isDefinite(end)) {
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
