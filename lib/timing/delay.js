import { extend, K } from "../util.js";

const proto = {
    tag: "Delay",

    generate(ops) {
        // FIXME 1Q06 Variable Delay
        const begin = ops.at(-1)[0];
        ops.at(-1).push(K(this));
        ops.push([begin + this.dur, K(this)]);
    }
};

export const Delay = dur => extend(proto, { dur });
