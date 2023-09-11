import { extend, K } from "../util.js";

const proto = {
    tag: "Seq",

    generate(thread) {
        thread.ops.at(-1).push(K(this));
        for (const child of this.children) {
            child.generate(thread);
        }
        thread.ops.at(-1).push(K(this));
    }
};

export const Seq = (...children) => extend(proto, { children });
