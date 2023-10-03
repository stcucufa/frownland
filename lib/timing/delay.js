import { extend, nop, parseTime, safe } from "../util.js";
import * as time from "./time.js";
import { Instant } from "./instant.js";

const proto = {
    tag: "Delay",

    show() {
        return `Delay(${time.show(this.duration)})`
    },

    generate(thread, t) {
        if (this.duration <= 0) {
            throw Error("Invalid duration for delay", { duration });
        }

        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        const begin = t;
        const end = time.add(begin, this.duration ?? time.unresolved());
        if (time.isUnresolved(end)) {
            // Variable delay: get the duration from the thread value. Duration
            // must be definite and > 0. Keep track of the resolved duration
            // for redo.
            thread.ops.push([
                (thread, vm) => {
                    let duration = thread.value;
                    if (typeof duration === "string") {
                        duration = safe(parseTime)(duration);
                    }
                    if (!(typeof duration === "number" && duration > 0)) {
                        throw Error("invalid duration for delay", { duration: thread.value });
                    }
                    vm.schedule(thread, vm.t + duration, end);
                },
                (thread, vm) => { vm.yield(thread); },
                (thread, vm) => { vm.yield(thread); },
            ]);
        } else {
            // Non-zero delay: schedule the thread to the destination time.
            thread.ops.push([
                (thread, vm) => { vm.schedule(thread, vm.t + this.duration); },
                (thread, vm) => { vm.yield(thread); },
                (thread, vm) => { vm.yield(thread); },
            ]);
        }
        return end;
    }
};

// Delay with an optional duration, which can be a number of milliseconds or a
// string that should parse to a time value
export const Delay = (...args) => args.length === 0 ? Object.create(proto) : extend(proto, {
    duration: time.check(args[0])
});
