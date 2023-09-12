import { extend, isNumber, K, parseTime, safe } from "../util.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    // Generate a delay if the duration is greater than zero; cut if off if it
    // exceeds the available duration.
    generate(thread, t, dur) {
        const duration = Math.min(this.duration, dur);
        if (duration > 0) {
            thread.ops.push(thread => {
                thread.t += duration;
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
