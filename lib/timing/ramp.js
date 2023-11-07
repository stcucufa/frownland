import { extend, isAsync } from "../util.js";
import { dur, setModifier } from "./util.js";
import { Await } from "./await.js";
import * as time from "./time.js";

const proto = {
    tag: "Ramp",

    // Dur defaults to indefinite.
    dur,

    // Target for setting a property/attribute.
    set(target) {
        return setModifier.call(this, "target", target);
    },

    attribute(attr) {
        return setModifier.call(this, "attribute", attr);
    },

    property(p) {
        return setModifier.call(this, "property", p);
    },

    // Register/unregister a ramp with the VM at begin and end. f will then be
    // called on every update with (value, p, t) where p is progress in the
    // [0, 1] interval throughout the duration of the ramp (0 when the ramp has
    // indefinite duration).
    generate(thread, t) {
        const dur = this.modifiers?.dur ?? Infinity;
        if (dur <= 0) {
            return t;
        }
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        thread.do((thread, vm) => {
            const isNewRamp = vm.ramp(thread, this.f, dur);
            if (isNewRamp && this.modifiers?.target) {
                thread.rampDidProgress = value => {
                    if (this.modifiers.attribute) {
                        this.modifiers.target.setAttribute(this.modifiers.attribute, value);
                    }
                    if (this.modifiers.property) {
                        this.modifiers.target[this.modifiers.property] = value;
                    }
                };
            }
        });
        thread.do((thread, vm) => {
            vm.endRamp(thread, this.f);
            delete thread.rampDidProgress;
        });
        t += dur;
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

// Create an instant from a function.
export const Ramp = f => extend(proto, { f });
