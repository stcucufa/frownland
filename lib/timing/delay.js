import { extend, isNumber, K, parseTime, safe } from "../util.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    generate(thread) {
        const begin = thread.ops.at(-1)[0];
        const end = begin + this.duration;
        if (end > begin) {
            thread.ops.at(-1).push(K(this));
            thread.ops.push([end, K(this)]);
        }
    }
};

export const Delay = duration => extend(proto, { duration: checkArgument(duration) });

// Check a duration/time argument, which may be a string or a number, and return
// a safe number.
function checkArgument(t) {
    if (typeof t === "string") {
        t = safe(parseTime)(t);
    }
    return isNumber(t) && t > 0 ? t : 0;
}
