import { extend } from "../util.js";
import { wrap } from "./instant.js";

const proto = {
    tag: "Seq",

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
