import { extend, isAsync } from "../util.js";
import { dur } from "./util.js";
import { Await } from "./await.js";

const proto = {
    tag: "Ramp",

    // Dur defaults to indefinite.
    dur,

    generate(thread, t) {
        const dur = this.modifiers?.dur ?? Infinity;
        if (dur <= 0) {
            return t;
        }
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        thread.do((thread, vm) => { vm.registerRamp(thread, this.f, dur); });
        t += dur;
        thread.do((thread, vm) => { vm.unregisterRamp(thread); });
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

// Create an instant from a function.
export const Ramp = f => extend(proto, { f });
