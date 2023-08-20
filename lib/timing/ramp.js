import { assign, create, extend, I, nop } from "../util.js";
import { cancelled, dur, label, pruned } from "./util.js";

export const Ramp = assign(child => create().call(Ramp, { child }), {
    tag: "Ramp",
    hasEffect: true,
    dur,

    init() {
        if (this.child) {
            if (Object.hasOwn(this.child, "parent")) {
                throw window.Error("Cannot share item between containers");
            }
            this.child.parent = this;
        }
    },

    show() {
        return `${this.tag}<${this.name}>`;
    },

    label,

    // Default duration is zero (do nothing in that case).
    get duration() {
        return this.modifiers?.dur ?? 0;
    },

    valueForInstance: I,

    // Input for child is the current progress value of the ramp.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.value;
    },

    childInstanceDidEnd: nop,

    // Like Set, save the initial value, but also schedule a new occurrence at
    // the beginning of the next interval while the end is not reached.
    instantiate(instance, t, dur) {
        const end = t + this.duration;
        const forward = (t, { to }) => {
            instance.value = (t - instance.begin) / this.duration;
            if (this.child) {
                instance.children.push(instance.tape.instantiate(this.child, t, 0, instance));
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
            const start = extend(instance, { t, forward });
            return isFinite(end) ? [start, extend(instance, { t: end, forward: (t, interval) => {
                forward(t, interval);
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } })] : start;
        }
    },

    cancelInstance: cancelled,
    pruneInstance: pruned
});
