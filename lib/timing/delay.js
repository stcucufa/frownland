import { extend } from "../util.js";
import { Op } from "../runtime/vm.js";

const proto = {
    tag: "Delay",

    generate(ops) {
        // FIXME 1Q06 Variable Delay
        const begin = ops.at(-1)[0];
        ops.at(-1).push(Op.begin.delay(this));
        ops.push([begin + this.dur, Op.end.delay(this)]);
    }
};

export const Delay = dur => extend(proto, { dur });
