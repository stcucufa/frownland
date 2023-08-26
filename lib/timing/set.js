import { extend, I } from "../util.js";
import { cancelled, dur, forward, pruned, Item, _Item } from "./util.js";

// Set a value for a property or attribute with a given name on a target for a
// given duration, then reset it. If the duration is zero, just set it.
export const Set = Item(["target", "name", "value"], extend(_Item, {
    tag: "Set",
    hasEffect: true,
    dur,

    show() {
        return `${this.tag}<${this.name}>`;
    },

    // Default duration is zero (do nothing in that case)
    get duration() {
        return this.modifiers?.dur ?? 0;
    },

    valueForInstance: I,

    // Set then reset the value if the duration is non-zero.
    instantiate(instance, t, dur) {
        const end = t + this.duration;
        if (end > t) {
            instance.begin = t;
            instance.end = end;
            const set = extend(instance, { t, forward: () => {
                instance.value = this.value ?? instance.parent?.item.inputForChildInstance(instance);
                if (this.name in this.target) {
                    instance.oldValue = this.target[this.name];
                    this.target[this.name] = instance.value;
                } else {
                    instance.oldValue = this.target.getAttribute(this.name);
                    this.target.setAttribute(this.name, instance.value);
                }
                return instance.value;
            } });
            return isFinite(end) ? [set, extend(instance, { t: end, forward: t => {
                if (this.name in this.target) {
                    this.target[this.name] = instance.oldValue;
                } else {
                    this.target.setAttribute(this.name, instance.oldValue);
                }
                delete instance.oldValue;
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } })] : set;
        }
        return Object.assign(instance, { t, forward: t => {
            instance.value = this.value ?? instance.parent?.item.inputForChildInstance(instance);
            if (this.name in this.target) {
                this.target[this.name] = instance.value;
            } else {
                this.target.setAttribute(this.name, instance.value);
            }
            instance.parent?.item.childInstanceDidEnd(instance, t);
        } });
    },

    // Reset the value early.
    cancelInstance(instance, t) {
        cancelled(instance, t);
        instance.tape.addOccurrence(extend(instance, { t, forward: t => {
            if (this.name in this.target) {
                this.target[this.name] = instance.oldValue;
            } else {
                this.target.setAttribute(this.name, instance.oldValue);
            }
            delete instance.oldValue;
        } }));
    },

    pruneInstance: pruned
}));
