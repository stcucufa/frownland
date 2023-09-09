import { extend } from "../util.js";
import { Op } from "../runtime/vm.js";

const proto = {
    tag: "Instant",

    generate([ops]) {
        ops.push(Op.instant(this));
    }
};

export const Instant = f => extend(proto, { f });
