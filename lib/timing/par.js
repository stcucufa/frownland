import { extend, push } from "../util.js";

const proto = {
    tag: "Par",
    
    generate(thread, t) {
        thread.ops.push(thread => {
            thread.scope = [];
            return this;
        });
        t = this.children.reduce(
            (t, child) => Math.max(t, child.generate(push(thread.ops, { ops: [] }), t)), t
        );
        thread.ops.push(thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = thread.scope;
            delete thread.scope;
            thread.t = t;
            return this;
            
        });
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
