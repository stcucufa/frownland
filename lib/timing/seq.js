import { assign, create, extend, isNumber, push } from "../util.js";
import {
    dur, ended, endOf, failed, forward, hasModifier, init, label, min, pruned, show, take,
    CancelError, FailureError, InputError
} from "./util.js";

// Seq is a sequence of items, guaranteeing that no items overlap. The output
// of every item becomes the input of the next one, the input of the Seq itself
// begin the input of the first child and the output of the Seq being the output
// of the last child.
export const Seq = assign((...children) => create().call(Seq, { children }), {
    tag: "Seq",
    show,
    label,
    init,
    take,
    dur,

    // The duration of a Seq is the sum of the duration of its children, unless
    // an explicit duration is set. A failing Seq will have a zero duration.
    // Addition of course gets a little more involved when we take into account
    // unresolved durations (such as folds and maps) and indefinite durations
    // (unbounded repetitions).
    get duration() {
        const duration = this.durationForChildren(this.children);
        return duration === null ? 0 : duration;
    },

    // This helper function returns null if the item is fallible, or a possibly
    // unresolved or indefinite duration.
    durationForChildren(children) {
        if (hasModifier(this, "dur")) {
            return this.modifiers.dur;
        }

        const n = this.modifiers?.take;
        if (n === 0) {
            return 0;
        }
        if (isFinite(n) && children.length < n) {
            return null;
        }

        let duration = 0;
        const m = min(children.length, n);
        for (let i = 0; i < m; ++i) {
            const child = children[i];
            if (child.fallible) {
                return null;
            }
            const d = child.duration;
            if (d === Infinity) {
                // If any duration is indefinite, the total is indefinite.
                return Infinity;
            }
            if (isNaN(d)) {
                // If either duration is unresolved, the sum is unresolved.
                duration = d;
            } else if (!isNaN(duration)) {
                // Simply add two resolved durations.
                duration += d;
            }
        }

        return duration;
    },

    // Fail if not enough children can be instantiated or if the requested
    // duration cannot be achieved.
    get fallible() {
        return this.durationForChildren(this.children) === null;
    },

    // Has effect if any child has effect.
    get hasEffect() {
        return this.children.some(child => child.hasEffect);
    },

    // The value of a Seq is the value of its last child.
    valueForInstance() {
        return this.children?.at(-1)?.value;
    },

    // Create a new Map object with the given generator function.
    map(x) {
        console.assert(this === Seq);
        return typeof x === "function" ? extend(FunctionMap, { g: x }) : create().call(Map, { child: x });
    },

    // Create a new Fold object with the given generator function and initial
    // accumulator value.
    fold(g, z) {
        console.assert(this === Seq);
        return extend(Fold, { g, z });
    },

    // A Seq instance is an interval, unless all of its children have zero
    // duration, and needs no occurrence of its own (because the children have
    // their own occurrences scheduled as needed), unless it is empty. Fails
    // if any child fails.
    instantiate(instance, t, dur) {
        if (this.fallible) {
            throw FailureError;
        }

        // The duration of the seq is contrained by the parent duration or the
        // item duration itself (if set). min can handle a second parameter that
        // is undefined so this duration is always going to be defined.
        const end = t + min(dur, this.modifiers?.dur);

        // Instantiate children as long as they have a definite duration. The
        // following children will be instantiated later when resolving the
        // child with an unresolved duration, or never if the child has an
        // indefinite duration (which is perfectly cromulent and not a failure).
        // Keep track of the number of children n of the instance since it can
        // be shortened by take() and dur() and is needed to verify that the
        // sequence ended.
        instance.children = [];
        instance.capacity = min(this.children.length, this.modifiers?.take);
        instance.begin = t;
        for (let i = 0; i < instance.capacity && isFinite(t) && t <= end; ++i) {
            const childInstance = instance.tape.instantiate(this.children[i], t, end - t, instance);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance);
                }
                throw FailureError;
            }
            t = endOf(push(instance.children, childInstance));

            // If a child instance is cut off then we cannot go any further.
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                instance.capacity = min(instance.children.length, this.modifiers?.take);
                instance.cutoff = true;
                break;
            }
        }

        if (hasModifier(this, "dur")) {
            t = end;
        }

        if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
            if (instance.children.length === 0) {
                return Object.assign(instance, { forward });
            }
        } else {
            if (isNumber(t)) {
                instance.end = t;
            }
            if (instance.children.length === 0) {
                console.assert(isNumber(t));
                return extend(instance, { t, forward });
            }
        }

        instance.currentChildIndex = 0;
        if (instance.children.length < instance.capacity) {
            // Record the maximum end time of the item to use when the next
            // children will be instantiated.
            instance.maxEnd = end;
        }
    },

    // A child with an unresolved duration becomes solved, so the following
    // siblings can now be instantiated (this happens after a Par.map or
    // Seq.fold gets evaluated and the children are created).
    childInstanceEndWasResolved(childInstance) {
        let end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const n = min(this.children.length, this.modifiers?.take);

        if (childInstance.cutoff) {
            // Stop instantiation here.
            delete childInstance.cutoff;
            instance.capacity = min(instance.children.length, this.modifiers?.take);
            instance.cutoff = true;
        } else {
            // Continue instantiation starting from the next child.
            const m = instance.children.length;
            for (let i = m; i < n && end <= instance.maxEnd; ++i) {
                const childInstance = instance.tape.instantiate(
                    this.children[i], end, instance.maxEnd - end, instance
                );
                if (!childInstance) {
                    for (let j = m; j < i; ++j) {
                        instance.children[j].item.pruneInstance(instance.children[j]);
                    }
                    instance.children.length = m;
                    failed(instance, end);
                    return;
                }
                end = endOf(push(instance.children, childInstance));

                // If a child instance is cut off then we cannot go any further.
                if (childInstance.cutoff) {
                    delete childInstance.cutoff;
                    instance.capacity = min(instance.children.length, this.modifiers?.take);
                    instance.cutoff = true;
                    break;
                }
            }
        }

        if (hasModifier(this, "dur")) {
            // The end was already set.
            return;
        }

        if (isNumber(end)) {
            ended(instance, end);
            instance.parent?.item.childInstanceEndWasResolved(instance);
        }
    },

    // Feed the input of the preceding child to the current child, or that of
    // the Seq itself for the first child, which can be requested from the
    // parent.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.currentChildIndex === 0 ?
            instance.parent?.item.inputForChildInstance(instance) :
            instance.children[instance.currentChildIndex - 1].value;
    },

    // Move to the next child when a child finishes by keeping track of the
    // index of the current child in the list of children. Done if the last
    // child of the list ended.
    childInstanceDidEnd(childInstance) {
        const end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);

        // Fail if a child fails; prune all children following the failed child.
        if (childInstance.error) {
            const n = instance.currentChildIndex + 1;
            for (let i = n; i < instance.children.length; ++i) {
                const child = instance.children[i];
                child.item.pruneInstance(child, end);
                delete child.parent;
            }
            instance.children.length = n;
            failed(instance, end);
            delete instance.currentChildIndex;
        } else {
            console.assert(instance.children[instance.currentChildIndex] === childInstance);
            instance.currentChildIndex += 1;
            if (instance.currentChildIndex === instance.capacity) {
                ended(instance, end, this.valueForInstance.call(instance), !isNumber(endOf(instance)));
                delete instance.currentChildIndex;
            }
        }
    },

    // Cancel the current child instance and prune the following ones. There is
    // no occurrence to remove (as there must be children) so do not call
    // cancelled(), but mark the instance as cancelled.
    cancelInstance(instance, t) {
        const currentChild = instance.children[instance.currentChildIndex];
        currentChild.item.cancelInstance(currentChild, t);
        for (let i = instance.currentChildIndex + 1; i < instance.children.length; ++i) {
            const child = instance.children[i];
            child.item.pruneInstance(child);
        }
        instance.children.length = instance.currentChildIndex + 1;
        ended(instance, t);
        instance.error = CancelError;
    },

    // Prune the instance and its children.
    pruneInstance(instance, t) {
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

// Seq/map with a child that gets instantiated for every input value in turn.
const Map = {
    tag: "Seq/map",
    show,
    label,
    init,
    take,
    dur,

    // Duration is unresolved, unless it is specified by dur() or modified by
    // take(0).
    get duration() {
        if (hasModifier(this, "dur")) {
            return this.modifiers.dur;
        }
        if (this.modifiers?.take === 0) {
            return 0;
        }
    },

    // Has effect if the child has effect.
    get hasEffect() {
        return this.child.hasEffect;
    },

    // Schedule instantiation of the contents.
    instantiate(instance, t, dur) {
        if (this.modifiers?.take === 0) {
            return Object.assign(instance, { t, forward });
        }

        instance.begin = t;
        return extend(instance, { t, forward(t) {
            instance.item.instantiateChildren(
                instance, instance.parent?.item.inputForChildInstance(instance), t, dur
            );
        } });
    },

    // Collect the values of the children as the value of the map itself.
    valueForInstance() {
        return this.children?.map(child => child.value) ?? [];
    },

    // Actually instantiate the children from the input.
    instantiateChildren(instance, xs, t, dur) {
        console.assert(t === instance.begin);
        if (!Array.isArray(xs)) {
            return failed(instance, t, InputError);
        }

        const end = t + min(dur, this.modifiers?.dur);

        // Check that we have the right number of input values.
        const n = this.modifiers?.take;
        if (isFinite(n)) {
            if (xs.length < n) {
                return failed(instance, t);
            }
            instance.input = xs.slice(0, n);
        } else {
            instance.input = xs;
        }

        instance.children = [];
        instance.capacity = instance.input.length;
        for (let i = 0; i < instance.capacity && isFinite(t) && t <= end; ++i) {
            const childInstance = instance.tape.instantiate(this.child, t, end - t, instance);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance, t);
                }
                return failed(instance, t);
            }
            t = endOf(push(instance.children, childInstance));

            // If a child instance is cut off then we cannot go any further
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                instance.cutoff = true;
                instance.capacity = min(instance.children.length, n);
                break;
            }
        }

        if (hasModifier(this, "dur")) {
            t = end;
        }

        if (isNumber(t)) {
            ended(instance, t);
            instance.parent?.item.childInstanceEndWasResolved(instance);
            if (instance.children.length === 0) {
                instance.value = this.valueForInstance.call(instance);
                instance.parent?.item.childInstanceDidEnd(instance);
                return;
            }
        }

        instance.currentChildIndex = 0;
        if (instance.children.length < instance.input.length) {
            instance.maxEnd = end;
        }
    },

    // Resume instantiation of children.
    childInstanceEndWasResolved(childInstance) {
        let end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(instance.children.at(-1) === childInstance);

        if (childInstance.cutoff) {
            // Stop instantiation here.
            delete childInstance.cutoff;
            instance.capacity = min(instance.input.length, n);
            instance.cutoff = true;
        } else {
            // Constinue instantiation starting from the next child.
            const m = instance.children.length;
            for (let i = m; i < instance.capacity && end <= instance.maxEnd; ++i) {
                const childInstance = instance.tape.instantiate(
                    this.child, end, instance.maxEnd - end, instance
                );
                if (!childInstance) {
                    for (let j = m; j < i; ++j) {
                        instance.children[j].item.pruneInstance(instance.children[j]);
                    }
                    instance.children.length = m;
                    failed(instance, end);
                    return;
                }
                end = endOf(push(instance.children, childInstance));

                // If a child instance is cut off then we cannot go any further
                if (childInstance.cutoff) {
                    delete childInstance.cutoff;
                    instance.capacity = min(instance.children.length, this.modifiers?.take);
                    instance.cutoff = true;
                }
            }
        }

        if (hasModifier(this, "dur")) {
            // The end was already set.
            return;
        }

        if (isNumber(end)) {
            ended(instance, end);
            instance.parent?.item.childInstanceEndWasResolved(instance);
        }
    },

    // Each successive child gets the next input from the Seq/map parent.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.input[instance.currentChildIndex];
    },

    childInstanceDidEnd: Seq.childInstanceDidEnd,
    cancelInstance: Seq.cancelInstance,
    pruneInstance: Seq.pruneInstance,
};

// Seq/fold is similar to Seq but its children are produced by mapping its
// input through the g function, and the initial value of the fold is given by
// z. The initial instantiation is an interval with an unresolved end time and
// an occurrence to instantiate the contents.
const Fold = {
    tag: "Seq/fold",
    show,
    label,
    take,
    dur,

    // Duration is unresolved, unless it is specified by dur() or modified by
    // take(0).
    get duration() {
        if (hasModifier(this, "dur")) {
            return this.modifiers.dur;
        }
        if (this.modifiers?.take === 0) {
            return 0;
        }
    },

    // Return the last child value, but in the case of no inputs, return the
    // initial accumulator value.
    valueForInstance() {
        return this.children?.at(-1)?.value ?? this.item.z;
    },

    // Schedule instantiation of the contents.
    instantiate(instance, t, dur) {
        if (this.modifiers?.take === 0) {
            return Object.assign(instance, { t, forward });
        }

        instance.begin = t;
        return extend(instance, { t, forward(t) {
            instance.item.instantiateChildren(
                instance, instance.parent?.item.inputForChildInstance(instance), t, dur
            );
        } });
    },

    // Actually instantiate the children from the input.
    instantiateChildren(instance, xs, t, dur) {
        console.assert(t === instance.begin);
        if (!Array.isArray(xs)) {
            return failed(instance, t, InputError);
        }

        const end = t + min(dur, this.modifiers?.dur);

        // Check that we have the right number of input values.
        const n = this.modifiers?.take;
        if (isFinite(n)) {
            if (xs.length < n) {
                return failed(instance, t);
            }
            instance.input = xs.slice(0, n);
        } else {
            instance.input = xs;
        }

        instance.children = [];
        instance.capacity = instance.input.length;
        for (let i = 0; i < instance.capacity && isFinite(t) && t <= end; ++i) {
            let childItem;
            try {
                childItem = this.g(xs[i], i);
            } catch {
                return failed(instance, t, InputError);
            }

            const childInstance = instance.tape.instantiate(childItem, t, end - t, instance);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance, t);
                }
                return failed(instance, t);
            }
            t = endOf(push(instance.children, childInstance));

            // If a child instance is cut off then we cannot go any further
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                instance.cutoff = true;
                instance.capacity = min(instance.children.length, n);
                break;
            }
        }

        if (hasModifier(this, "dur")) {
            t = end;
        }

        if (isNumber(t)) {
            ended(instance, t);
            instance.parent?.item.childInstanceEndWasResolved(instance);
            if (instance.children.length === 0) {
                instance.value = this.valueForInstance.call(instance);
                instance.parent?.item.childInstanceDidEnd(instance);
                return;
            }
        }

        instance.currentChildIndex = 0;
        if (instance.children.length < instance.input.length) {
            instance.maxEnd = end;
        }
    },

    // Feed the input of the preceding child to the current child, or that of
    // the Seq itself for the first child, which can be requested from the
    // parent.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.currentChildIndex === 0 ?
            this.z :
            instance.children[instance.currentChildIndex - 1].value;
    },

    // Resume instantiation of children.
    childInstanceEndWasResolved(childInstance) {
        let end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(instance.children.at(-1) === childInstance);

        if (childInstance.cutoff) {
            // Stop instantiation here.
            delete childInstance.cutoff;
            instance.capacity = min(instance.input.length, n);
            instance.cutoff = true;
        } else {
            // Constinue instantiation starting from the next child.
            const m = instance.children.length;
            for (let i = m; i < instance.capacity && end <= instance.maxEnd; ++i) {
                let childItem;
                try {
                    childItem = this.g(instance.input[i], i);
                } catch {
                    return failed(instance, end, InputError);
                }
                const childInstance = instance.tape.instantiate(
                    childItem, end, instance.maxEnd - end, instance
                );
                if (!childInstance) {
                    for (let j = m; j < i; ++j) {
                        instance.children[j].item.pruneInstance(instance.children[j]);
                    }
                    instance.children.length = m;
                    failed(instance, end);
                    return;
                }
                end = endOf(push(instance.children, childInstance));

                // If a child instance is cut off then we cannot go any further
                if (childInstance.cutoff) {
                    delete childInstance.cutoff;
                    instance.capacity = min(instance.children.length, this.modifiers?.take);
                    instance.cutoff = true;
                }
            }
        }

        if (hasModifier(this, "dur")) {
            // The end was already set.
            return;
        }

        if (isNumber(end)) {
            ended(instance, end);
            instance.parent?.item.childInstanceEndWasResolved(instance);
        }
    },

    childInstanceDidEnd: Seq.childInstanceDidEnd,
    cancelInstance: Seq.cancelInstance,
    pruneInstance: Seq.pruneInstance,
};

// Seq/map is just like Seq/fold but taking its initial input from its parent,
// like a normal Seq, and returns a list of its outputs in order.
const FunctionMap = extend(Fold, {
    tag: "Seq/map",

    // Collect the values of the children as the value of the map itself.
    valueForInstance() {
        return this.children?.map(child => child.value) ?? [];
    },

    // Each successive child gets the next input from the Seq/map parent.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.input[instance.currentChildIndex];
    },
});
