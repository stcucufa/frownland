import { extend, push } from "../util.js";
import { Thread } from "../runtime.js";

const proto = {
    tag: "Par",
    
    generate(thread, t) {
        thread.ops.push(thread => {
            thread.accumulator = [];
            return this;
        });
        t = this.children.reduce(
            (t, child) => Math.max(t, child.generate(push(thread.ops, Thread()), t)), t
        );
        thread.ops.push(thread => {
            thread.value = thread.accumulator;
            delete thread.accumulator;
            thread.t = t;
            return this;
            
        });
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
