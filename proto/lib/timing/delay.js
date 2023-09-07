import { assign, extend, isNumber, parseTime, safe } from "../../../lib/util.js";
import { Instant } from "./instant.js";
import { beginOf, forward, min, pruned, Item, _Item } from "./util.js";

// Delay(duration) delays its value for `duration` amount of time, which is
// greater than zero. Cannot fail.
const _Delay = extend(_Item, {
    tag: "Delay",

    show() {
        return `${this.tag}<${this.duration}>`;
    },

    // Create a new DelayUntil item.
    until(t) {
        console.assert(this === Delay);
        t = checkArgument(t);
        return t > 0 ? DelayUntil(t) : Instant();
    },

    // The instance for a delay is an interval, with an occurrence at the end
    // of the interval. The parent duration may cut off the delay, which is
    // reported by the instance.
    instantiate(instance, t, dur) {
        if (dur === 0) {
            // This is a degenerate case where the delay must fit in zero
            // duration.
            return Object.assign(instance, { t, cutoff: true, forward });
        }
        instance.begin = t;
        if (this.duration < dur) {
            instance.end = t + this.duration;
        } else {
            instance.end = t + dur;
            instance.cutoff = true;
        }
        if (isFinite(instance.end)) {
            return Object.assign(instance, { t: instance.end, forward });
        }
    },
});

export const Delay = assign(createDelay, _Delay);

// Delay until time t relative to the begin of the parent. If the delay begins
// after the requested time, this acts just like an Instant. Not fallible.
const DelayUntil = Item(["t"], extend(_Delay, {
    tag: "Delay/until",

    get duration() {},

    show() {
        return `${this.tag}<${this.t}>`;
    },

    // Instantiate an interval, unless the time for the delay has already
    // passed, in which case this is just an instant.
    instantiate(instance, t, dur, parent) {
        const maxEnd = t + dur;
        const itemEnd = (beginOf(parent) ?? t) + this.t;
        const end = min(itemEnd, maxEnd);
        if (itemEnd > maxEnd) {
            // There is a delay but it is cutoff from the desired duration.
            instance.cutoff = true;
        }
        if (end <= t) {
            // The time has already passed.
            return Object.assign(instance, { t, forward });
        }
        instance.begin = t;
        instance.end = end;
        return extend(instance, { t: end, forward });
    },
}));

// Check a duration/time argument, which may be a string or a number, and return
// a safe number.
function checkArgument(t) {
    if (typeof t === "string") {
        t = safe(parseTime)(t);
    }
    return isNumber(t) && t > 0 ? t : 0;
}

// Create a new delay (see above) with duration as a read-only property.
// Treat any illegal value as 0, which defaults to an Instant().
function createDelay(duration) {
    const value = checkArgument(duration);
    return value === 0 ? Instant() : extend(_Delay, { duration: value });
}
