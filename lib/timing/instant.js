import { extend, I, isNumber, nop, parseTime, safe } from "../util.js";
import { Delay } from "./delay.js";
import { Seq } from "./seq.js";
import { cancelled, forward, pruned, show, varModifier, Item } from "./util.js";

// Instant(f) evaluates f instantly. f should not have any side effect and
// defaults to I (identity). Repeatable, cannot fail.
export const Instant = Item(["valueForInstance"], {
    tag: "Instant",
    show,
    var: varModifier,

    // If a valid duration is set, then this is wrapped into a Seq.
    dur(duration) {
        if (typeof duration === "string") {
            duration = safe(parseTime)(duration);
        }
        return isNumber(duration) && duration > 0 ? Seq(Delay(duration), this) : this;
    },

    // An instant has no duration.
    get duration() {
        return 0;
    },

    // The occurrence for an instant is the same as its instance using the
    // generic forward function.
    instantiate: (instance, t) => Object.assign(instance, { t, forward }),

    // valueForInstance is called with the instance as `this` instead of an
    // instance parameter (so the first paremeter is the input value for the
    // item).
    valueForInstance: I,

    // Other “instance” functions are called with the item as `this` and the
    // instance as the first parameter (and often t as the second parameter).
    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Effect is similar to Instant but has side effects.
export const Effect = Item(["valueForInstance"], extend(Instant, {
    tag: "Effect",
    hasEffect: true,
}));
