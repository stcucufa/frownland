import { extend, push } from "../util.js";

const proto = {
    tag: "Par",
    
    generate(ops) {
        ops.at(-1).push(thread => {
            thread.scope = [];
            return this;
        });
        const begin = ops.at(-1)[0];
        const end = this.children.reduce((end, child) => {
            const thread = push(ops.at(-1), { ops: [[begin]] });
            child.generate(thread.ops);
            return Math.max(end, thread.ops.at(-1)[0]);
        }, begin);
        const op = thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = thread.scope;
            delete thread.scope;
            return this;
            
        };
        if (end === begin) {
            ops.at(-1).push(op);
        } else {
            ops.push([end, op]);
        }
    }
};

export const Par = (...children) => extend(proto, { children });
