import { extend, K } from "../util.js";

const proto = {
    tag: "Seq",

    generate(thread, t, dur) {
        thread.ops.push(K(this));
        const begin = t;
        const end = t + dur;
        for (const child of this.children) {
            t = child.generate(thread, t, dur - t + begin);
            if (t > end) {
                t = end;
                break;
            }
        }
        thread.ops.push(K(this));
        return t;
    }
};

export const Seq = (...children) => extend(proto, { children });
