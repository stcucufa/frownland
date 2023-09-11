import { extend, push } from "../util.js";

const proto = {
    tag: "Par",
    
    generate(thread) {
        thread.ops.at(-1).push(thread => {
            thread.scope = [];
            return this;
        });
        const begin = thread.ops.at(-1)[0];
        const end = this.children.reduce((end, child) => {
            const childThread = push(thread.ops.at(-1), { ops: [[begin]] });
            child.generate(childThread);
            return Math.max(end, childThread.ops.at(-1)[0]);
        }, begin);
        const op = thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = thread.scope;
            delete thread.scope;
            return this;
            
        };
        if (end === begin) {
            thread.ops.at(-1).push(op);
        } else {
            thread.ops.push([end, op]);
        }
    }
};

export const Par = (...children) => extend(proto, { children });
