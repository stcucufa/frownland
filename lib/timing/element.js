import { assign, create, extend } from "../util.js";
import { cancelled, dur, forward, pruned } from "./util.js";

// Specialized effect: add/remove a DOM element.
export const Element = assign((element, parentElement, sibling) => create().call(
    Element, { element, parentElement, sibling }
), {
    tag: "Element",
    hasEffect: true,
    dur,

    show() {
        return `${this.tag}<${this.element.tagName}>`;
    },

    get duration() {
        return this.modifiers?.dur ?? 0;
    },

    valueForInstance() {
        return this.item.element;
    },

    // If the duration is zero, this is a nop (like Instant()), otherwise, add
    // the element to the parent on begin, and remove it on end.
    instantiate(instance, t, dur) {
        const end = t + this.duration;
        if (end > t) {
            instance.begin = t;
            instance.end = end;
            instance.value = this.valueForInstance.call(instance);
            const add = extend(instance, { t, forward: () => {
                return (this.parentElement ?? document.body).insertBefore(this.element, this.context);
            } });
            return isFinite(end) ? [add, extend(instance, { t: end, forward: t => {
                this.element.remove();
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } })] : add;
        }
        return Object.assign(instance, { t, forward });
    },

    // Reschedule the end occurrence
    cancelInstance(instance, t) {
        cancelled(instance, t);
        instance.tape.addOccurrence(extend(instance, { t, forward: t => {
            this.element.remove();
        } }));
    },

    pruneInstance: pruned
});
