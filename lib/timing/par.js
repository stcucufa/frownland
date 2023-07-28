import { assign, create, extend, fold1, isNumber, partition, push, remove } from "../util.js";
import { repeat } from "./repeat.js";
import {
    dur, cancelled, ended, endOf, failed, forward, hasModifier, init, max, min, show, take, pruned,
    CancelError, InputError, FailureError
} from "./util.js";

// Par is a container for items that all begin at the same time, ending when
// all children have ended. The value is the list of all values of the
// individual items in the order that children were specified. This behaviour
// can be modified with take(), in which case the result values are
// in the order in which the children finished. Fails if too many children
// fail. Repeatable (as long as the duration is non zero).
export const Par = assign((...children) => create().call(Par, { children }), {
    tag: "Par",
    show,
    repeat,
    take,
    dur,
    init,

    // The duration of a par is the duration of the child that finishes last.
    // A par with no children has zero duration.
    get duration() {
        if (hasModifier(this, "dur")) {
            return this.modifiers.dur;
        }
        const children = itemsByDuration(this.children, this.modifiers?.take);
        let duration = 0;
        for (const [d] of children) {
            if (d === Infinity) {
                return Infinity;
            }
            if (isNaN(d) || duration < d) {
                duration = d;
            }
        }
        return duration;
    },

    // Fail if not enough children can be instantiated.
    get fallible() {
        return this.fallibleChildren(this.children);
    },

    // Has effect if any child has effect.
    get hasEffect() {
        return this.children.some(child => child.hasEffect);
    },

    fallibleChildren(children) {
        const failingChildCount = children.filter(child => child.fallible).length;
        const n = this.modifiers?.take;
        if (isFinite(n)) {
            return children.length - failingChildCount < n;
        } else {
            return failingChildCount > 0;
        }
    },

    // Collect the values of the children as the value of the par itself.
    // The values are in the order of the children, unless modified by take()
    // in which case they are in the order in which the children ended.
    valueForInstance() {
        const value = (
            hasModifier(this.item, "take") ? this.finished : this.children
        ).map(child => child.value);
        delete this.finished;
        return value;
    },

    // Create a new Map object with the given generator function.
    map(g) {
        console.assert(this === Par);
        return extend(this, ParMap, { g });
    },

    // A Par instance is an interval (unless all of its children have zero
    // duration), and needs no occurrence of its own (because the children have
    // their own occurrences scheduled as needed), unless it is empty.
    instantiate(instance, t, dur) {
        return this.instantiateChildren(instance, this.children, t, dur);
    },

    instantiateChildren(instance, children, t, dur) {
        if (this.fallibleChildren(children)) {
            throw FailureError;
        }

        // itemDur is the duration potentially set by .dur(), which may be
        // lower than the available duration so we take the minimum value.
        const itemDur = this.modifiers?.dur;
        dur = min(dur, itemDur);

        // Gather the children and instantiate them.
        if (hasModifier(this, "take")) {
            instance.capacity = this.modifiers.take;
            children = (xs => xs.map(([_, x]) => x))(itemsByDuration(children, instance.capacity));
        }
        // Set the capacity to exactly how many children are expected to finish.
        if (!isFinite(instance.capacity)) {
            instance.capacity = children.length;
        }
        instance.children = [];
        for (const child of children) {
            const childInstance = instance.tape.instantiate(child, t, dur, instance);
            if (childInstance.cutoff) {
                instance.cutoff = true;
                delete childInstance.cutoff;
            }
            instance.children.push(childInstance);
        }
        instance.finished = [];

        // Set t or begin/end for the par instance and create an occurrence at
        // the end if there are no children.
        const end = isNumber(itemDur) ?
            t + dur :
            instance.capacity < instance.children.length ?
                endOfNth(instance.children, instance.capacity - 1) :
                instance.children.reduce((end, child) => max(end, endOf(child)), t);
        if (end === t) {
            instance.t = t;
            if (instance.children.length === 0) {
                return Object.assign(instance, { forward });
            }
        } else {
            instance.begin = t;
            if (isNumber(end)) {
                instance.end = end;
            }
            if (instance.children.length === 0) {
                return extend(instance, { t, forward });
            }
        }
    },

    // Every child has the same input as the par itself, that is, the input
    // of the parent of the par.
    inputForChildInstance(childInstance) {
        return this.parent?.inputForChildInstance(childInstance.parent);
    },

    // When enough children have finished, then the par itself finishes with
    // the collection of their value. If there is no take() modifier, then
    // the values are in the same order as the children, otherwise they are
    // in the order in which the children finished (using the child order for
    // children finishing at the exact same time).
    childInstanceDidEnd(childInstance) {
        const end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        if (!instance.finished) {
            // The instance has already finished (this is a lingering effect).
            return;
        }

        // When a child fails at runtime, the par itself may fail if not enough
        // children can succeed to fill its capacity.
        if (childInstance.error) {
            const n = this.modifiers?.take;
            if (instance.children.length - 1 >= n) {
                // It is still possible to recover from this failure
                remove(instance.children, childInstance);
            } else {
                // Cancel all the other children and fail
                for (const child of instance.children) {
                    if (child !== childInstance && !Object.hasOwn(child, "value")) {
                        child.item.cancelInstance(child, end);
                    }
                }
                delete instance.finished;
                failed(instance, end);
            }
        } else {
            instance.finished.push(childInstance);
            if (instance.finished.length === instance.capacity) {
                for (const child of instance.children) {
                    if (instance.finished.indexOf(child) < 0) {
                        child.item.cancelInstance(child, end);
                    }
                }
                ended(instance, end, this.valueForInstance.call(instance), !isNumber(endOf(instance)));
            }
        }
    },

    // Once an unresolved end time becomes resolved, the end time of the par
    // itself may be resolved (if enough children have a resolved end time). In
    // that case, the parent can then be notified in turn.
    childInstanceEndWasResolved(childInstance) {
        if (hasModifier(this, "dur")) {
            return;
        }

        const childEnd = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        // Get the list of all resolved child ends.
        const ends = instance.children.reduce((ends, child) => {
            const end = endOf(child);
            if (isNumber(end)) {
                push(ends, end);
            }
            return ends;
        }, []);
        const n = instance.capacity ?? instance.children.length;
        if (ends.length >= n) {
            const end = ends.length > n ? ends.sort((a, b) => a - b)[n - 1] : fold1(ends, max);
            ended(instance, end);
            instance.parent?.item.childInstanceEndWasResolved(instance);
        }
    },

    // Cancel all children that have not finished yet.
    cancelInstance(instance, t) {
        delete instance.finished;
        if (!instance.children || instance.children.length === 0) {
            cancelled(instance, t);
        } else {
            for (const child of instance.children) {
                if (!Object.hasOwn(child, "value")) {
                    child.item.cancelInstance(child, t);
                }
            }
            ended(instance, t);
            instance.error = CancelError;
            // No occurrence to remove for the instance itself.
        }
    },

    // Prune all children.
    pruneInstance(instance, t) {
        delete instance.finished;
        if (!instance.children || instance.children.length === 0) {
            pruned(instance, t);
        } else {
            for (const child of instance.children) {
                if (!Object.hasOwn(child, "value")) {
                    child.item.pruneInstance(child, t);
                }
            }
            delete instance.parent;
            // No occurrence to remove for the instance itself.
        }
    },
});

// Par/map is similar to Par but its children are produced by mapping its
// input through the g function. The initial instantiation is an interval
// with an unresolved end time and an occurrence to instantiate the contents.
export const ParMap = {
    tag: "Par/map",

    // Cannot fail at instantiation time (unlike Par which may fail depending
    // on its children).
    get fallible() {
        return false;
    },

    // Duration is unresolved, unless it is modified by take(0) or has a set
    // duration.
    get duration() {
        if (this.modifiers?.take === 0) {
            return 0;
        }
        return this.modifiers?.dur;
    },

    // Schedule instantiation of the contents.
    instantiate(instance, t, dur) {
        if (this.modifiers?.take === 0) {
            instance.finished = [];
            return Object.assign(instance, { t, forward });
        }

        instance.begin = t;
        return extend(instance, { t, forward(t) {
            instance.item.instantiateChildren(
                instance, instance.parent?.item.inputForChildInstance(instance), t, dur
            );
        } });
    },

    // Actually instantiate the children from the input. If the input is not
    // an array, or an error occurs while creating the content from the input,
    // fail with an input error.
    instantiateChildren(instance, xs, t, dur) {
        console.assert(t === instance.begin);
        if (!Array.isArray(xs)) {
            return failed(instance, t, InputError);
        }

        // Get the child elements first.
        const children = [];
        for (let i = 0; i < xs.length; ++i) {
            try {
                children.push(this.g(xs[i], i));
            } catch (error) {
                return failed(instance, t, InputError);
            }
        }

        // Instantiate children, which may fail.
        try {
            const occurrence = Par.instantiateChildren.call(this, instance, children, t, dur);
            const end = endOf(instance);
            instance.children.forEach(child => {
                child.input = xs[children.indexOf(child.item)];
            });
            if (isNumber(end)) {
                ended(instance, end);
                instance.parent?.item.childInstanceEndWasResolved(instance);
                if (instance.children.length === 0) {
                    instance.value = this.valueForInstance.call(instance);
                    instance.parent?.item.childInstanceDidEnd(instance);
                }
            }
            return occurrence;
        } catch {
            failed(instance, t);
        }
    },

    // Input values are distributed to the children as their input. Because
    // child instances may be reordered, each instance records its input value.
    inputForChildInstance(childInstance) {
        console.assert(Object.hasOwn(childInstance, "input"));
        const input = childInstance.input;
        delete childInstance.input;
        return input;
    },
};

// Return the nth end of a list of instances, or unresolved if any instance has
// an unresolved end.
function endOfNth(instances, n) {
    const ends = [];
    for (const instance of instances) {
        const end = endOf(instance);
        if (!isNumber(end)) {
            return;
        }
        ends.push(end);
    }
    return ends.toSorted((a, b) => a - b)[n];
}

// Select at least n items from the list according to their duration, keeping
// them in their original order, and return [duration, item] pairs. Fallible
// items are sorted out. Note that more than n items may be returned since
// items with unresolved duration and items with effect still begin; and zero
// items are returned when there is an insufficient number of items to fulfill
// the constraint.
function itemsByDuration(items, n) {
    if (n === 0) {
        return [];
    }
    const itemsWithDuration = items.filter(item => !item.fallible).map(item => [item.duration, item]);
    const m = itemsWithDuration.length;
    if (!isFinite(n) || n === m) {
        return itemsWithDuration;
    }
    if (n > m) {
        return [];
    }
    const [resolved, unresolved] = partition(itemsWithDuration,
        ([duration, item]) => duration >= 0 && !item.hasEffect
    );
    resolved.sort(([a], [b]) => a - b);
    const selectedItems = new window.Set(unresolved.concat(resolved.slice(0, n)));
    return selectedItems.length === m ?
        itemsWithDuration : itemsWithDuration.filter(item => selectedItems.has(item));
}
