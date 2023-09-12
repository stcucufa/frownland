import { extend, isNumber, K } from "../util.js";
import { dur } from "./util.js";

const proto = {
    tag: "Seq",

    dur,

    generate(thread, t, dur) {
        thread.ops.push(K(this));
        const begin = t;
        const end = t + Math.min(this.modifiers?.dur ?? Infinity, dur);
        for (const child of this.children) {
            t = child.generate(thread, t, dur - t + begin);
            if (t > end) {
                break;
            }
        }
        if (isNumber(this.modifiers?.dur)) {
            if (t < end) {
                const delay = end - t;
                thread.ops.push(thread => {
                    thread.t += delay;
                    return this;
                });
            }
            t = end;
        }
        thread.ops.push(K(this));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
