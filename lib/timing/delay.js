import { extend, parseTime, safe } from "../util.js";
import * as time from "./time.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    generate(thread, t) {
        const end = time.add(t, this.duration);
        if (end == null) {
            // Variable delay: get the duration from the thread value. Duration
            // must be definite and > 0.
            thread.ops.push((thread, vm) => {
                let duration = thread.value;
                if (typeof duration === "string") {
                    duration = safe(parseTime)(duration);
                }
                if (!(typeof duration === "number" && duration > 0)) {
                    throw new Error("invalid duration for delay", { duration: thread.value });
                }
                vm.schedule(thread, thread.t + duration);
                return this;
            });
        } else if (this.duration > 0) {
            // Non-zero delay
            thread.ops.push((thread, vm) => {
                vm.schedule(thread, end);
                return this;
            });
        }
        return end;
    }
};

// Delay with an optional duration, which can be a number of milliseconds or a
// string that should parse to a time value
export const Delay = (...args) => args.length === 0 ? Object.create(proto) : extend(proto, {
    duration: time.check(args[0])
});
