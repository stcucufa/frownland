import { extend, I, isNumber, nop, parseTime, safe } from "../util.js";
import { Delay } from "./delay.js";
import { Seq } from "./seq.js";
import { forward, varModifier, Item, _Item } from "./util.js";

// Instant(f) evaluates f instantly. f should not have any side effect and
// defaults to I (identity). Repeatable, cannot fail.
const _Instant = extend(_Item, {
    tag: "Instant",
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
});

export const Instant = Item(["valueForInstance"], _Instant);

// Effect is similar to Instant but has side effects.
export const Effect = Item(["valueForInstance"], extend(_Instant, {
    tag: "Effect",
    hasEffect: true,
}));
