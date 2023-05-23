import { assign, create, extend, I, isNumber, K, nop, partition, push, remove } from "./util.js";

const Fail = Error("Instantiation failure");
const RepeatMax = 17;

const Capacity = new Map(); // capacity for items, set by take()
const Duration = new Map(); // duration for items, set by dur()

// The score is the root of the tree of timing items.
export const Score = Object.assign(children => create().call(Score, { children: children ?? [] }), {
    tag: "Score",
    show,
    init,

    // Add an item to the score.
    add(item) {
        console.assert(!Object.hasOwn(item, parent));
        item.parent = this;
        return push(this.children, item);
    },

    inputForChildInstance: nop,
    childInstanceDidEnd: nop,
    childInstanceEndWasResolved: nop,
    childInstanceDidFail: nop,
});

// Instant(f) evaluates f instantly. f should not have any side effect and
// defaults to I (identity). Repeatable, cannot fail.
export const Instant = assign(f => f ? extend(Instant, { valueForInstance: f }) : Object.create(Instant), {
    tag: "Instant",
    show,
    repeat,

    // An instant has no duration.
    get duration() {
        return 0;
    },

    // Cannot fail at instantiation time.
    failible: K(false),

    // The occurrence for an instant is the same as its instance using the
    // generic forward function.
    instantiate: (instance, t) => Object.assign(instance, { t, forward }),

    // valueForInstance is called with the instance as `this` instead of an
    // instance parameter (so the first paremeter is the input value for the
    // item).
    valueForInstance: I,

    // Other “instance” functions are called with the item as `this` and the
    // instance as the first parameter (and often t as the second parameter).
    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Create a new delay (see below) with duration as a read-only property.
// Treat any illegal value as 0, which defaults to an Instant().
function createDelay(duration) {
    const properties = {
        duration: {
            enumerable: true,
            value: duration >= 0 ? duration : 0
        },
    };
    if (properties.duration.value === 0) {
        return Instant();
    }
    return Object.create(Delay, properties);
}

// Delay(duration) delays its value for `duration` amount of time, which is
// greater than zero. Repeatable, cannot fail.
export const Delay = Object.assign(createDelay, {
    tag: "Delay",

    show() {
        return `${this.tag}<${this.duration}>`;
    },

    repeat,

    // Can never fail.
    failible: K(false),

    // The instance for a delay is an interval, with an occurrence at the end
    // of the interval. The parent duration may cut off the delay, which is
    // reported by the instance.
    instantiate(instance, t, dur) {
        instance.begin = t;
        if (this.duration < dur) {
            instance.end = t + this.duration;
        } else {
            instance.end = t + dur;
            instance.cutoff = true;
        }
        return Object.assign(instance, { t: instance.end, forward });
    },

    // Delay just returns its input value after the delay has passed.
    valueForInstance: I,

    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Par is a container for items that all begin at the same time, ending when
// all children have ended. The value is the list of all values of the
// individual items in the order that children were specified. This behaviour
// can be modified with take(), in which case the result values are
// in the order in which the children finished. Fails if too many children
// fail. Repeatable (as long as the duration is non zero).
export const Par = assign(children => create().call(Par, { children: children ?? [] }), {
    tag: "Par",
    show,
    repeat,
    take,
    dur,
    init,

    // The duration of a par is the duration of the child that finishes last.
    // A par with no children has zero duration.
    get duration() {
        if (Duration.has(this)) {
            return Duration.get(this);
        }
        const children = itemsByDuration(this.children, Capacity.get(this));
        const firstDuration = children[0]?.[0];
        const lastDuration = children.at(-1)?.[0];
        return children.length === 0 ? 0 :
            // If the last child has an indefinite duration then the par has
            // an indefinite duration. Otherwise the duration may be unresolved,
            // which depends on whether the first item has an unresolved
            // duration or not; if the first child has a resolved duration, then
            // the last one is the longest, otherwise the duration is
            // unresolved.
            lastDuration === Infinity ? Infinity :
            isNaN(firstDuration) ? firstDuration : lastDuration;
    },

    // Fail if not enough children can be instantiated.
    failible(dur) {
        return this.failibleChildren(this.children, dur);
    },

    failibleChildren(children, dur) {
        const failingChildCount = children.filter(child => child.failible(dur)).length;
        const n = Capacity.get(this);
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
        const value = (Capacity.has(this.item) ? this.finished : this.children).map(child => child.value);
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
        // itemDur is the duration potentially set by .dur(), which may be
        // lower than the available duration so we take the minimum value.
        const itemDur = Duration.get(this);
        dur = min(dur, itemDur);
        if (this.failibleChildren(children, dur)) {
            throw Fail;
        }

        // Gather the children and instantiate them.
        if (Capacity.has(this)) {
            instance.capacity = Capacity.get(this);
            children = (xs => xs.map(([_, x]) => x))(itemsByDuration(children, instance.capacity));
        }
        // Set the capacity to exactly how many children are expected to finish.
        if (!isFinite(instance.capacity)) {
            instance.capacity = children.length;
        }
        instance.children = children.map(child => Object.assign(
            instance.tape.instantiate(child, t, dur),
            { parent: instance }
        ));
        instance.finished = [];

        // Set t or begin/end for the par instance and create an occurrence at
        // the end if there are no children.
        const end = isNumber(itemDur) ?
            t + dur :
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
    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        instance.finished.push(childInstance);
        if (instance.finished.length === instance.capacity) {
            for (const child of instance.children) {
                if (instance.finished.indexOf(child) < 0) {
                    child.item.cancelInstance(child, t);
                }
            }
            ended(instance, t, this.valueForInstance.call(instance));
        }
    },

    // Once an unresolved end time becomes resolved, the end time of the par
    // itself may be resolved (if all children have a resolved end time). In
    // that case, the parent can then be notified in turn.
    childInstanceEndWasResolved(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const end = instance.children.reduce((end, child) => max(end, endOf(child)), -Infinity);
        if (isNumber(end) && end >= t) {
            if (instance.begin === end) {
                delete instance.begin;
                instance.t = end;
            } else {
                instance.end = end;
            }
            instance.parent?.item.childInstanceEndWasResolved(instance, end);
        }
    },

    // When a child fails at runtime, the par itself may fail if not enough
    // children can succeed to fill its capacity.
    childInstanceDidFail(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const n = Capacity.get(this);
        if (instance.children.length - 1 >= n) {
            // It is still possible to recover from this failure
            remove(instance.children, childInstance);
        } else {
            // Cancel all the other children and fail
            for (const child of instance.children) {
                if (child !== childInstance && !Object.hasOwn(child, "value")) {
                    child.item.cancelInstance(child, t);
                }
            }
            delete instance.finished;
            failed(instance, t);
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
            instance.cancelled = true;
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

    // Cannot fail at instantiation time.
    failible: K(false),

    // Duration is unresolved, unless it is modified by take(0) or has a set
    // duration.
    get duration() {
        if (Capacity.get(this) === 0) {
            return 0;
        }
        return Duration.get(this);
    },

    // Schedule instantiation of the contents.
    instantiate(instance, t, dur) {
        if (Capacity.get(this) === 0) {
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

    // Actually instantiate the children from the input.
    instantiateChildren(instance, xs, t, dur) {
        console.assert(t === instance.begin);
        if (!Array.isArray(xs)) {
            return failed(instance, t);
        }

        // Get the child elements first.
        const children = xs.map((x, i) => {
            try {
                return this.g(x, i);
            } catch {
            }
        });

        // Instantiate children, which may fail.
        try {
            const occurrence = Par.instantiateChildren.call(this, instance, children, t, dur);
            const end = endOf(instance);
            instance.children.forEach(child => {
                child.input = xs[children.indexOf(child.item)];
            });
            if (isNumber(end)) {
                if (instance.children.length === 0) {
                    instance.value = this.valueForInstance.call(instance);
                    instance.parent?.item.childInstanceDidEnd(instance, t);
                }
                instance.parent?.item.childInstanceEndWasResolved(instance, end);
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

// Seq is a sequence of items, guaranteeing that no items overlap. The output
// of every item becomes the input of the next one, the input of the Seq itself
// begin the input of the first child and the output of the Seq being the output
// of the last child.
export const Seq = assign(children => create().call(Seq, { children: children ?? [] }), {
    tag: "Seq",
    show,
    init,
    take,
    dur,
    repeat,

    // The duration of a Seq is the sum of the duration of its children, unless
    // an explicit duration is set. A failing Seq will have a zero duration.
    // Addition of course gets a little more involved when we take into account
    // unresolved durations (such as folds and maps) and indefinite durations
    // (unbounded repetitions).
    get duration() {
        const duration = this.durationForChildren(this.children);
        return duration === null ? 0 : duration;
    },

    // This helper function returns null if the item is failible, or a possibly
    // unresolved or indefinite duration.
    durationForChildren(children) {
        if (Duration.has(this)) {
            return Duration.get(this);
        }

        const n = Capacity.get(this);
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
            if (child.failible(Infinity)) {
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

    // The value of a Seq is the value of its last child.
    valueForInstance() {
        return this.children?.at(-1)?.value;
    },

    // Fail if not enough children can be instantiated or if the requested
    // duration cannot be achieved.
    failible(dur) {
        return this.durationForChildren(this.children) === null;
    },

    // Create a new SeqMap object with the given generator function.
    map(g) {
        console.assert(this === Seq);
        return extend(SeqMap, { g });
    },

    // Create a new SeqFold object with the given generator function and initial
    // accumulator value.
    fold(g, z) {
        console.assert(this === Seq);
        return extend(SeqFold, { g, z });
    },

    // A Seq instance is an interval, unless all of its children have zero
    // duration, and needs no occurrence of its own (because the children have
    // their own occurrences scheduled as needed), unless it is empty. Fails
    // if any child fails.
    instantiate(instance, t, dur) {

        // The duration of the seq is contrained by the parent duration or the
        // item duration itself (if set). min can handle a second parameter that
        // is undefined so this duration is always going to be defined.
        const end = t + min(dur, Duration.get(this));

        // Instantiate children as long as they have a definite duration. The
        // following children will be instantiated later when resolving the
        // child with an unresolved duration, or never if the child has an
        // indefinite duration (which is perfectly cromulent and not a failure).
        // Keep track of the number of children n of the instance since it can
        // be shortened by take() and dur() and is needed to verify that the
        // sequence ended.
        instance.children = [];
        instance.n = min(this.children.length, Capacity.get(this));
        const begin = t;
        for (let i = 0; i < instance.n && t <= end; ++i) {
            const childInstance = instance.tape.instantiate(this.children[i], t, end - t);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance);
                }
                throw Fail;
            }
            t = endOf(push(instance.children, Object.assign(childInstance, { parent: instance })));

            // If a child instance is cut off then we cannot go any further.
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                instance.n = min(instance.children.length, Capacity.get(this));
                break;
            }
        }

        if (Duration.has(this)) {
            t = end;
        }

        if (begin === t) {
            instance.t = t;
            if (instance.children.length === 0) {
                return Object.assign(instance, { forward });
            }
        } else {
            instance.begin = begin;
            if (isNumber(t)) {
                // Don’t set the end if it is not resolved yet.
                instance.end = t;
            }
            if (instance.children.length === 0) {
                console.assert(isNumber(t));
                return extend(instance, { t, forward });
            }
        }

        instance.currentChildIndex = 0;
    },

    // A child with an unresolved duration becomes solved, so the following
    // siblings can now be instantiated (this happens after a Par.map or
    // Seq.fold gets evaluated and the children are created).
    childInstanceEndWasResolved(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(instance.children.at(-1) === childInstance);
        const n = min(this.children.length, Capacity.get(this));
        const m = instance.children.length;
        for (let i = m; i < n && isFinite(t); ++i) {
            const childInstance = instance.tape.instantiate(this.children[i], t);
            if (!childInstance) {
                for (let j = m; j < i; ++j) {
                    instance.children[j].item.pruneInstance(instance.children[j]);
                }
                instance.children.length = m;
                failed(instance, t);
                return;
            }
            t = endOf(push(instance.children, Object.assign(childInstance, { parent: instance })));
        }

        if (instance.children.length === n && isNumber(t)) {
            if (instance.begin === t) {
                delete instance.begin;
                instance.t = t;
            } else {
                instance.end = t;
            }
        } else if (t === Infinity) {
            instance.end = t;
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
    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(instance.children[instance.currentChildIndex] === childInstance);
        instance.currentChildIndex += 1;
        if (instance.currentChildIndex === instance.n) {
            instance.value = this.valueForInstance.call(instance);
            if (!Duration.has(instance.item)) {
                instance.end = t;
            }
            instance.parent?.item.childInstanceDidEnd(instance, instance.end);
            delete instance.currentChildIndex;
        }
    },

    // Fail if a child fails.
    childInstanceDidFail(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.currentChildIndex === instance.children.length - 1);
        delete instance.currentChildIndex;
        failed(instance, t);
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
        instance.cancelled = true;
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

// Seq/fold is similar to Seq but its children are produced by mapping its
// input through the g function, and the initial value of the fold is given by
// z. The initial instantiation is an interval with an unresolved end time and
// an occurrence to instantiate the contents.
const SeqFold = {
    tag: "Seq/fold",
    show,
    take,
    repeat,

    // Return the last child value, but in the case of no inputs, return the
    // initial accumulator value.
    valueForInstance() {
        return this.children?.at(-1)?.value ?? this.item.z;
    },

    // Duration is unresolved, unless it is modified by take(0).
    get duration() {
        if (Capacity.get(this) === 0) {
            return 0;
        }
    },

    // Cannot fail at instantiation time. 
    failible: K(false),

    // Schedule instantiation of the contents.
    instantiate(instance, t) {
        if (Capacity.get(this) === 0) {
            return Object.assign(instance, { t, forward });
        }

        instance.begin = t;
        return extend(instance, { t, forward(t) {
            if (instance.item.instantiateChildren(
                instance, instance.parent?.item.inputForChildInstance(instance), t
            ) === Fail) {
                failed(instance, t);
            }
        } });
    },

    // Actually instantiate the children from the input.
    instantiateChildren(instance, xs, t) {
        console.assert(t === instance.begin);
        if (!Array.isArray(xs)) {
            return Fail;
        }

        // Check that we have the right number of input values.
        const n = Capacity.get(this);
        if (isFinite(n)) {
            if (xs.length < n) {
                return Fail;
            }
            instance.input = xs.slice(0, n);
        } else {
            instance.input = xs;
        }

        instance.children = [];
        for (let i = 0; i < instance.input.length && isFinite(t); ++i) {
            const childInstance = instance.tape.instantiate(this.g(xs[i]), t);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance, t);
                }
                throw Fail;
            }
            t = endOf(push(instance.children, Object.assign(childInstance, { parent: instance })));
        }

        if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
            instance.value = this.valueForInstance.call(instance);
            if (instance.children.length === 0) {
                instance.parent?.item.childInstanceDidEnd(instance, t);
            }
        } else {
            console.assert(instance.children.length > 0);
            if (isNumber(t)) {
                instance.end = t;
            }
        }

        if (isNumber(t)) {
            instance.parent?.item.childInstanceEndWasResolved(instance, t);
        }
        instance.currentChildIndex = 0;
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

    // Move to the next child when a child finishes by keeping track of the
    // index of the current child in the list of children. Done if the last
    // child of the list ended.
    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(instance.children[instance.currentChildIndex] === childInstance);
        instance.currentChildIndex += 1;
        if (instance.currentChildIndex === min(instance.input.length, Capacity.get(this))) {
            instance.value = this.valueForInstance.call(instance);
            instance.end = t;
            instance.parent?.item.childInstanceDidEnd(instance, t);
            delete instance.currentChildIndex;
        }
    },

    childInstanceDidFail: Seq.childInstanceDidFail,
    cancelInstance: Seq.cancelInstance,
    pruneInstance: Seq.pruneInstance,
};

// Seq/map is just like Seq/fold but taking its initial input from its parent,
// like a normal Seq, and returns a list of its outputs in order.
export const SeqMap = extend(SeqFold, {
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

// Repeat is a special kind of Seq that keeps instantiating its child when it
// finishes and never ends (unless capped by take()).
const Repeat = assign(child => extend(Repeat, { child }), {
    tag: "Seq/repeat",
    show,
    init,
    take,

    // Duration is indefinite, unless it is modified by take in which case it
    // is a product of the number of iterations by the duration of the item
    // being repeated.
    get duration() {
        const repeats = Capacity.get(this);
        const duration = repeats === 0 ? 0 : repeats > 0 ? this.child.duration * repeats : Infinity;
        if (!isNaN(duration)) {
            // Limited repetition of an unresolved duration is unresolved,
            // so only return resolved durations.
            return duration;
        }
    },

    // Fails if the inner item fails, or if it has zero duration and repeats
    // indefinitely.
    failible() {
        if (this.child.failible()) {
            return true;
        }
        const n = Capacity.get(this) ?? Infinity;
        return this.child.duration === 0 && n === Infinity;
    },

    instantiate(instance, t) {
        if (this.failible()) {
            throw Fail;
        }

        if (Capacity.get(this) === 0) {
            return Object.assign(instance, { t, forward });
        }
        if (this.duration === 0) {
            instance.t = t;
        } else {
            instance.begin = t;
        }
        instance.children = [Object.assign(instance.tape.instantiate(this.child, t), { parent: instance })];
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
    // unless the total number of iterations has been reached.
    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        if (instance.children.length > RepeatMax) {
            // This is just for debug purposes and should be removed eventually.
            throw Error("Too many repeats");
        }
        if (instance.children.length === Capacity.get(this)) {
            ended(instance, t, childInstance.value);
        } else {
            instance.children.push(Object.assign(
                instance.tape.instantiate(this.child, t), { parent: instance }
            ));
        }
    },

    // Fail if the child fails.
    childInstanceDidFail(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        console.assert(childInstance === instance.children.at(-1));
        failed(instance, t);
    },

    valueForInstance: I,
    childInstanceEndWasResolved: nop,
});

// Dump an instance and its children for debugging and testing.
export function dump(instance, indent = "* ") {
    const selfDump = `${indent}${instance.id} ${
        Object.hasOwn(instance, "begin") ? `[${instance.begin}, ${
            isFinite(instance.end) ? instance.end : "∞"
        }[` : `@${instance.t}`
    }${
        instance.failed ? " (failed)" : instance.cancelled ? " (cancelled)" :
        Object.hasOwn(instance, "value") ? ` <${instance.value}>` : ""
    }`;
    if (!instance.children) {
        return selfDump;
    }
    return [
        selfDump,
        ...instance.children.map(child => dump(child, `  ${indent}`))
    ].join("\n");
}

// Generic init function for containers, setting themselves as parent of their
// children.
function init() {
    for (const child of this.children) {
        console.assert(!Object.hasOwn(child, "parent"));
        child.parent = this;
    }
}

// Generic show function for items, using their tag and children length.
function show() {
    return this.children ? `${this.tag}/${this.children.length}` : this.tag;
}

// Set the capacity of an item with take.
function take(n = Infinity) {
    console.assert(!Capacity.has(this));
    console.assert(n >= 0);
    Capacity.set(this, n >= 0 ? n : 0);
    return this;
}

// Set the duration of an item with dur.
function dur(d) {
    console.assert(!Duration.has(this));
    console.assert(d >= 0);
    Duration.set(this, d);
    return this;
}

// Create a Repeat item from any item.
function repeat() {
    return Repeat(this);
}

// Get the begin/end time of an instance (either an occurrence with t, or an
// interval with begin/end).
const beginOf = x => x?.begin ?? x?.t;
const endOf = x => x?.end ?? x?.t;

// Generic forward function for instances, getting the input from the parent
// and storing the value in the instance. Note that `this` is a deck occurrence
// which may wrap the actual instance in case it was created by addInterval.
function forward(t, interval) {
    const instance = Object.hasOwn(this, "item") ? this : Object.getPrototypeOf(this);
    if (Object.hasOwn(instance, "value")) {
        return;
    }

    const item = instance.item;
    instance.value = item.valueForInstance.call(
        instance, instance.parent?.item.inputForChildInstance(instance), t, interval
    );
    instance.parent?.item.childInstanceDidEnd(instance, endOf(instance));
}

// When an instance is pruned, it erases its occurrence from the tape.
function pruned(instance) {
    delete instance.parent;
    instance.tape.removeOccurrenceForInstance(instance);
}

// When an instance is cancelled, it ends and gets marked as such, erasing
// its occurrence from the tape.
function cancelled(instance, t) {
    ended(instance, t);
    instance.cancelled = true;
    instance.tape.removeOccurrenceForInstance(instance);
}

// When an instance fails, it ends and gets marked as such, notify its parent.
function failed(instance, t) {
    ended(instance, t);
    instance.failed = true;
    instance.parent?.item.childInstanceDidFail(instance, t);
}

// When an instance has ended, its end or t property gets updated and its value
// is optionally stored (note that it may be undefined), in which case the
// parent instance is notified.
function ended(...args) {
    const [instance, t, value] = args;
    const endsWithValue = args.length > 2;
    if (Object.hasOwn(instance, "begin")) {
        if (endsWithValue && Duration.has(instance.item)) {
            // Do not overwrite the end that was already set for normal
            // termination from dur.
            console.assert(t <= instance.end);
        } else if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
        } else {
            console.assert(t > instance.begin);
            instance.end = t;
        }
    }
    if (endsWithValue) {
        instance.value = value;
        instance.parent?.item.childInstanceDidEnd(instance, endOf(instance));
    }
}

// Minimum function accepting an undefined value as its second argument, for
// use with Capacity.get() and Duration.get().
const min = (x, y) => isNumber(y) ? Math.min(x, y) : x;

// Maximum function accepting an undefined value as its second argument, which
// is considered higher than any definite number (for unresolved durations).
const max = (x, y) => isNumber(y) ? Math.max(x, y) : x === Infinity ? x : y;

// Sort a list of items by their duration, optionally capping the list at a
// maximum of n items. Failible items (at instantiation) are filtered out first.
// Items with an unresolved duration or with an effect do not count toward the
// duration. Return a list of [duration, item] pairs sorted by duration, with
// items with unresolved duration coming before any other.
function itemsByDuration(items, n) {
    if (n === 0) {
        return [];
    }
    const itemsWithDuration = items.filter(item => !item.failible()).map(item => [item.duration, item]);
    if (isFinite(n) && n > itemsWithDuration.length) {
        return [];
    }
    const [resolved, unresolved] = partition(itemsWithDuration, ([duration]) => duration >= 0);
    resolved.sort(([a], [b]) => a - b);
    return unresolved.concat(n < itemsWithDuration.length ? resolved.slice(0, n) : resolved);
}
