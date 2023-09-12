import { clamp, extend, isNumber, push } from "../util.js";
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
        dur = Math.min(this.modifiers?.dur ?? Infinity, dur);
        const end = t + dur;
        t = this.children.reduce(
            (t, child) => clamp(child.generate(push(thread.ops, Thread()), t, dur), t, end), t
        );
        if (isNumber(this.modifiers?.dur)) {
            t = end;
        }
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
