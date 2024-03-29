import { extend, nop } from "../../../lib/util.js";
import { Tape } from "../tape.js";
import { cancelled, dur, Item, _Item } from "./util.js";

// Ramp goes from 0 to 1 over a duration, then back to zero instantly at the
// end. Its child gets called every time an update occurs within that duration
// (which depends on the rate at which the deck is running).
export const Ramp = Item(["child"], extend(_Item, {
    tag: "Ramp",
    dur,

    show() {
        return `${this.tag}`;
    },

    // Has effect if the (optional) child has effect.
    get hasEffect() {
        return this.duration > 0 && this.child?.hasEffect;
    },

    // Default duration is zero (do nothing in that case).
    get duration() {
        return this.modifiers?.dur ?? 0;
    },

    // Instantiate the ramp: create occurrences for the beginning and the end,
    // and one for the beginning of the next interval if it occurs before the
    // end. The child is itself instantiate each time in a zero-duration
    // interval with a different tape.
    instantiate(instance, t, dur) {
        if (this.duration === 0) {
            throw FailureError;
        }

        const end = t + this.duration;
        instance.begin = t;
        instance.end = end;
        if (this.child) {
            instance.childTape = Tape();
        }
        const forward = (t, { to }) => {
            instance.value = (t - instance.begin) / this.duration;
            if (this.child) {
                instance.childTape.instantiate(this.child, t, 0, instance);
                const interval = { from: t, to: Infinity };
                for (const occurrence of instance.childTape.occurrencesInInterval(interval)) {
                    console.assert(occurrence.t === t);
                    occurrence.forward(occurrence.t, interval);
                }
            }
            if (end > to) {
                // FIXME 1X03 Transient occurrences
                instance.nextOccurrence = instance.tape.addOccurrence(extend(instance, { t: to, forward }));
            }
            return instance.value;
        };
        const start = extend(instance, { t, forward });
        return isFinite(end) ? [start, extend(instance, { t: end, forward: (t, interval) => {
            delete instance.childTape;
            delete instance.nextOccurrence;
            instance.parent?.item.childInstanceDidEnd(instance, t);
        } })] : start;
    },

    // Input for child is the current progress value of the ramp.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.value;
    },

    // Get the value from the child instance during the ramp.
    childInstanceDidEnd(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        instance.value = childInstance.value;
    },

    // Cancel all children that have not finished yet.
    cancelInstance(instance, t) {
        delete instance.childTape;
        if (instance.nextOccurrence) {
            instance.tape.removeOccurrence(instance.nextOccurrence)
            delete instance.nextOccurrence;
        }
        cancelled(instance, t);
    },
}));
