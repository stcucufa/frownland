import { extend, K } from "../util.js";
import { dur, durMin, durMax, durBetween } from "./util.js";

const proto = {
    tag: "Seq",

    dur,
    durMin,
    durMax,
    durBetween,

    generate(thread, t, dur) {
        thread.ops.push(K(this));
        const begin = t;
        const [min, max] = this.modifiers?.dur ?? [0, Infinity];
        const end = t + Math.min(max, dur);
        for (const child of this.children) {
            t = child.generate(thread, t, dur - t + begin);
            if (t > end) {
                break;
            }
        }

        if (this.modifiers?.dur) {
            const minEnd = begin + min;
            if (t < minEnd) {
                const delay = Math.min(minEnd, end) - t;
                thread.ops.push(thread => {
                    thread.t += delay;
                    return this;
                });
                t += delay;
            } else if (t > end) {
                t = end;
            }
        }
        thread.ops.push(K(this));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
