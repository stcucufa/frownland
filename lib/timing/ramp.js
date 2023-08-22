import { Tape } from "../tape.js";
import { assign, create, extend, I, nop } from "../util.js";
import { cancelled, dur, initSingleChild, label, pruned } from "./util.js";

export const Ramp = assign(child => create().call(Ramp, { child }), {
    tag: "Ramp",
    dur,

    init: initSingleChild,

    show() {
        return `${this.tag}<${this.name}>`;
    },

    label,

    // Has effect if the (optional) child has effect.
    get hasEffect() {
        return this.child?.hasEffect;
    },

    // Default duration is zero (do nothing in that case).
    get duration() {
        return this.modifiers?.dur ?? 0;
    },

    valueForInstance: I,

    // Like Set, save the initial value, but also schedule a new occurrence at
    // the beginning of the next interval while the end is not reached.
    instantiate(instance, t, dur) {
        const end = t + this.duration;
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
                instance.tape.addOccurrence(extend(instance, { t: to, forward }));
            }
            return instance.value;
        };
        if (end > t) {
            instance.begin = t;
            instance.end = end;
            instance.children = [];
            if (this.child) {
                instance.childTape = Tape();
            }
            const start = extend(instance, { t, forward });
            return isFinite(end) ? [start, extend(instance, { t: end, forward: (t, interval) => {
                forward(t, interval);
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } })] : start;
        }
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

    cancelInstance: cancelled,
    pruneInstance: pruned
});
