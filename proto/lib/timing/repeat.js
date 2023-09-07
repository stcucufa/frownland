import { extend, nop } from "../../../lib/util.js";
import { first } from "./par.js";
import {
    dur, ended, endOf, failed, hasModifier, min, take,
    Item, _Item, CancelError, FailureError
} from "./util.js";

// Repeat is a special kind of Seq that keeps instantiating its child when it
// finishes and never ends (unless capped by take()).
export const Repeat = Item(["child"], extend(_Item, {
    tag: "Repeat",
    take,
    dur,

    // Wrap the repeat in a first with x as the other child; the repetition then
    // ends when x ends. The value is then the value of x.
    until(x) {
        return first(this, x);
    },

    // Duration is indefinite, unless it is modified by take in which case it
    // is a product of the number of iterations by the duration of the item
    // being repeated.
    get duration() {
        if (hasModifier(this, "dur")) {
            return this.modifiers.dur;
        }
        const repeats = this.modifiers?.take;
        const duration = repeats === 0 ? 0 : repeats > 0 ? this.child.duration * repeats : Infinity;
        if (!isNaN(duration)) {
            // Limited repetition of an unresolved duration is unresolved,
            // so only return resolved durations.
            return duration;
        }
    },

    // A repeat may have an indefinite duration, but is considered to have
    // effect if its child has effect.
    get hasEffect() {
        return isNaN(this.child.duration) || this.child.hasEffect;
    },

    // Fails if the inner item fails, or if it has zero duration and repeats
    // indefinitely.
    get fallible() {
        if (this.child.fallible) {
            return true;
        }
        const n = this.modifiers?.take ?? Infinity;
        return this.child.duration === 0 && n === Infinity;
    },

    // Instantiate the first iteration of the repeat, or immediately return a
    // single occurrence if there are no iterations.
    instantiate(instance, t, dur) {
        if (this.fallible) {
            throw FailureError;
        }

        if (this.modifiers?.take === 0) {
            return Object.assign(instance, { t, forward });
        }

        instance.maxEnd = t + min(dur, this.modifiers?.dur);
        instance.capacity = this.modifiers?.take ?? Infinity;
        if (instance.maxEnd === t) {
            instance.t = t;
        } else {
            instance.begin = t;
            instance.end = hasModifier(this, "dur") ? instance.maxEnd : Infinity;
        }
        instance.children = [instance.tape.instantiate(this.child, t, dur, instance)];
    },

    // Because repeat children are instantiated one at a time, the child
    // instance that needs input is always the last one, and its input the
    // output of the instance preceding, or the the input of the parent in the
    // case of the first child instance.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const index = instance.children.length - 1;
        console.assert(childInstance === instance.children[index]);
        return index === 0 ?
            instance.parent?.item.inputForChildInstance(instance) :
            instance.children[index - 1].value;
    },

    // When an instance ends, immediately instantiate its contents again,
    // unless the total number of iterations has been reached. If the end of
    // the duration is reached, the instance may fail if it did not reach the
    // required number of iterations as specified by take().
    childInstanceDidEnd(childInstance) {
        const end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);

        // Fail if the child fails.
        if (childInstance.error) {
            console.assert(childInstance === instance.children.at(-1));
            failed(instance, end);
        } else {
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                if (isFinite(instance.capacity)) {
                    return failed(instance, end);
                }
                instance.cutoff = true;
                return ended(instance, end, childInstance.value);
            }

            if (instance.children.length === instance.capacity) {
                ended(instance, end, childInstance.value, !hasModifier(this, "dur"));
            } else {
                instance.children.push(
                    instance.tape.instantiate(this.child, end, instance.maxEnd - end, instance)
                );
            }
        }
    },

    // Cancelling a repeat is a simpler version of cancelling a Seq as only
    // the last child instance needs to be cancelled.
    cancelInstance(instance, t) {
        const currentChild = instance.children.at(-1);
        currentChild.item.cancelInstance(currentChild, t);
        ended(instance, t);
        instance.error = CancelError;
    },

    // Pruning is even simpler since there are no scheduled children that have
    // not started yet.
    pruneInstance(instance, t) {
        delete instance.parent;
    },

    childInstanceEndWasResolved: nop,
}));
