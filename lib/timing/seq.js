import { extend } from "../util.js";
import { Op } from "../runtime/vm.js";

const proto = {
    tag: "Seq",

    generate(ops) {
        ops.at(-1).push(Op.begin(this));
        for (const child of this.children) {
            child.generate(ops, ops.at(-1)[0]);
        }
        ops.at(-1).push(Op.end(this));
    }
};

export const Seq = (...children) => extend(proto, { children });
