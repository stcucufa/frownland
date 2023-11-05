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
        thread.ops.do((thread, vm) => { vm.registerRamp(thread); });
    }
};

// Create an instant from a function.
export const Ramp = f => extend(proto, { f });
