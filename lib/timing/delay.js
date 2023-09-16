import { extend } from "../util.js";
import * as time from "./time.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    generate(thread, t) {
        t = time.add(t, this.duration);
        if (this.duration !== 0) {
            thread.ops.push((thread, vm) => {
                vm.schedule(thread, t);
                return this;
            });
        }
        return t;
    }
};

// Delay with an optional duration, which can be a number of milliseconds or a
// string that should parse to a time value
export const Delay = (...args) => args.length === 0 ? Object.create(proto) : extend(proto, {
    duration: time.check(args[0])
});
