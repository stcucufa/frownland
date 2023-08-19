import { assign, create, extend, I } from "../util.js";
import { cancelled, dur, label, pruned } from "./util.js";

export const Ramp = assign(child => create().call(Ramp, { child }), {
    tag: "Ramp",
    hasEffect: true,
    dur,

    init() {
        if (Object.hasOwn(this.child, "parent")) {
            throw window.Error("Cannot share item between containers");
        }
        this.child.parent = this;
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

    // Like Set, save the initial value, but also schedule a new occurrence at
    // the beginning of the next interval while the end is not reached.
    instantiate(instance, t, dur) {
        const end = t + this.duration;
        const forward = (t, { to }) => {
            // p = 0
            if (end > to) {
                instance.tape.addOccurrence(extend(instance, { t: to, forward }));
            }
        };
        if (end > t) {
            instance.begin = t;
            instance.end = end;
            const start = extend(instance, { t, forward: (_, { to }) => {
                if (this.name in this.target) {
                    instance.oldValue = this.target[this.name];
                    this.target[this.name] = 0;
                } else {
                    instance.oldValue = this.target.getAttribute(this.name);
                    this.target.setAttribute(this.name, 0);
                }
                if (end > to) {
                    instance.tape.addOccurrence(extend(instance, { t: to, forward }));
                }
                return instance.value;
            } });
            return isFinite(end) ? [start, extend(instance, { t: end, forward: t => {
                instance.value = 1;
                setValue(this.target, this.name, instance.oldValue);
                delete instance.oldValue;
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } })] : set;
        }
    },

    cancelInstance: cancelled,
    pruneInstance: pruned
});
