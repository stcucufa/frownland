import { clamp, extend, push } from "../util.js";
import { dur } from "./util.js";
import { Thread } from "../runtime.js";

const proto = {
    tag: "Par",

    dur,

    generate(thread, t, dur) {
        thread.ops.push(thread => {
            thread.accumulator = [];
            return this;
        });
        const end = t + Math.min(this.modifiers?.dur ?? Infinity, dur);
        t = this.children.reduce(
            (t, child) => clamp(child.generate(push(thread.ops, Thread()), t), t, end), t
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
