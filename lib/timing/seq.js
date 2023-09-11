import { extend, K } from "../util.js";
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
        thread.ops.push(K(this));
    }
};

export const Seq = (...children) => extend(proto, { children });
