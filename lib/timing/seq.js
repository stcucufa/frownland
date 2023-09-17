import { extend, K } from "../util.js";
import { wrap } from "./instant.js";

const proto = {
    tag: "Seq",

    generate(thread, t) {
        thread.ops.push(K(this));
        for (const child of this.children) {
            t = wrap(child).generate(thread, t);
        }
        thread.ops.push(K(this));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
