import { extend, isNumber, K, parseTime, safe } from "../util.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    generate(thread, t, dur) {
        if (this.duration > 0 && this.duration <= dur) {
            thread.ops.push(thread => {
                thread.t += this.duration;
                return this;
            });
        }
        return t + this.duration;
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
