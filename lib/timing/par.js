import { clamp, extend, push } from "../util.js";
import { dur, durMin, durMax, durBetween } from "./util.js";
import { Thread } from "../runtime.js";

const proto = {
    tag: "Par",

    dur,
    durMin,
    durMax,
    durBetween,

    generate(thread, t, dur) {
        thread.ops.push(thread => {
            thread.accumulator = [];
            return this;
        });
        const [min, max] = this.modifiers?.dur ?? [0, Infinity];
        dur = Math.min(dur, max);
        const begin = t;
        const end = begin + dur;
        t = this.children.reduce(
            (t, child) => clamp(child.generate(push(thread.ops, Thread()), t, dur), t, end), t
        );
        if (this.modifiers?.dur) {
            const minEnd = begin + min;
            if (t < minEnd) {
                t = Math.min(minEnd, end);
            } else if (t > end) {
                t = end;
            }
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
