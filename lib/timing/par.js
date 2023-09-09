import { extend, push } from "../util.js";
import { Op } from "../runtime/vm.js";

const proto = {
    tag: "Par",
    
    generate(ops) {
        ops.at(-1).push(Op.begin(this));
        const begin = ops.at(-1)[0];
        const end = this.children.reduce((end, child) => {
            const thread = push(ops.at(-1), { ops: [[begin]] });
            child.generate(thread.ops);
            return Math.max(end, thread.ops.at(-1)[0]);
        }, begin);
        if (end === begin) {
            ops.at(-1).push(Op.end(this));
        } else {
            ops.push([end, Op.end(this)]);
        }
    }
};

export const Par = (...children) => extend(proto, { children });
