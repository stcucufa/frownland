import { extend, isNumber, K, parseTime, safe } from "../util.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    generate(thread, t) {
        if (this.duration > 0) {
            thread.ops.push((thread, vm) => {
                vm.schedule(thread, t + this.duration);
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
