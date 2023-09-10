import { extend, K } from "../util.js";

const proto = {
    tag: "Delay",

    generate(thread) {
        // FIXME 1Q06 Variable Delay
        const begin = thread.ops.at(-1)[0];
        thread.ops.at(-1).push(K(this));
        thread.ops.push([begin + this.dur, K(this)]);
    }
};

export const Delay = dur => extend(proto, { dur });
