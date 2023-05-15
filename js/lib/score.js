import { assign, create, extend, I, isNumber, nop, push, remove } from "./util.js";

const Fail = Error("Instantiation failure");
const Capacity = new Map();
const RepeatMax = 17;

// The score is the root of the tree of timing items.
export const Score = Object.assign(children => create().call(Score, { children: children ?? [] }), {
    tag: "Score",
    show,
    init,

    // Add an item to the score.
    add(item) {
        this.children.push(item);
        item.parent = this;
        return item;
    },

    inputForChildInstance: nop,
    childInstanceDidEnd: nop,
    childInstanceEndWasResolved: nop,
    childInstanceDidFail: nop,
});

// Instant(f) evaluates f instantly. f should not have any side effect and
// defaults to I (identity). Repeatable, cannot fail.
export const Instant = assign(f => f ? extend(Instant, { valueForInstance: f }) : Instant, {
    tag: "Instant",
    show,
    repeat,

    // An instant has no duration.
    get dur() {
        return 0;
    },

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

// Create a new delay (see below) with dur as a read-only property.
function createDelay(dur) {
    const properties = {
        dur: {
            enumerable: true,
            value: dur
        }
    };
    if (dur <= 0) {
        properties.failible = {
            enumerable: true,
            value: true
        }
    }
    return Object.create(Delay, properties);
}

// Delay(dur) delays its value for `dur` amount of time, which should be greater
// than zero (otherwise fails to instantiate). Repeatable.
export const Delay = Object.assign(createDelay, {
    tag: "Delay",

    show() {
        return `${this.tag}<${this.dur}>`;
    },

    repeat,

    // The instance for a delay is an interval, with an occurrence at the end
    // of the interval. Fails if the duration is not greater than zero.
    instantiate(instance, t) {
        if (this.dur <= 0) {
            throw Fail;
        }
        instance.begin = t;
        instance.end = t + this.dur;
        return Object.assign(instance, { t: instance.end, forward });
    },

    valueForInstance: I,
    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Par is a container for items to all start at the same time, ending when the
// all children have ended. The value is the list of all values of the
// individual items in the order that children were specified.
// This behaviour can be modified with take(), in which case the result values
// are in the order in which the children finished.
export const Par = assign(children => create().call(Par, { children: children ?? [] }), {
    tag: "Par",
    show,
    repeat,
    take,
    init,

    // The duration of a par is the duration of the child that finishes last.
    // A par with no children has no duration.
    get dur() {
        const n = Capacity.get(this);
        if (n === 0) {
            return 0;
        }
        const children = itemsByDuration(this.children, n);
        if (children.length === 0) {
            return 0;
        }
        if (children.some(([dur]) => dur === Infinity)) {
            return Infinity;
        }
        if (children.every(([dur]) => isNumber(dur))) {
            if (isFinite(n)) {
                // The children are sorted by duration and all durations are
                // resolved so the last one is the longest.
                return children.at(-1)[0];
            }
            let dur = 0;
            for (let i = 0; i < children.length; ++i) {
                const d = children[i][0];
                if (isNaN(d)) {
                    // If any duration is unresolved, the max is unresolved.
                    return;
                }
                dur = Math.max(dur, d);
            }
            return dur;
        }
    },

    // Fail if not enough children can be instantiated.
    get failible() {
        const failingChildCount = this.children.filter(child => child.failible).length;
        const n = Capacity.get(this);
        if (isFinite(n)) {
            return this.children.length - failingChildCount < n;
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
    // their own occurrences scheduled as needed), unless it is empty. Fails
    // if enough children fail that the capacity of the map cannot be
    // fulfilled.
    instantiate(instance, t) {
        if (this.failible) {
            throw Fail;
        }

        instance.children = []; // children in instantiation order
        instance.finished = []; // children in ending order

        const n = Capacity.get(this);
        const children = n === 0 ? [] :
            isFinite(n) ? (xs => xs.map(([_, x]) => x))(itemsByDuration(this.children, n)) : this.children;

        const end = children.reduce((end, child) => max(end, endOf(Object.assign(
            push(instance.children, instance.tape.instantiate(child, t)),
            { parent: instance }
        ))), t);
        if (end === t) {
            instance.t = t;
            if (instance.children.length === 0) {
                return Object.assign(instance, { forward });
            }
        } else {
            console.assert(instance.children.length > 0);
            instance.begin = t;
            if (isNumber(end)) {
                instance.end = end;
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
        if (instance.finished.length === min(instance.children.length, Capacity.get(this))) {
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
    get failible() {
        return false;
    },

    // Duration is unresolved, unless it is modified by take(0).
    get dur() {
        if (Capacity.get(this) === 0) {
            return 0;
        }
    },

    // Schedule instantiation of the contents.
    instantiate(instance, t) {
        if (Capacity.get(this) === 0) {
            instance.finished = [];
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

        // Get the child elements first.
        instance.input = xs;
        let children = instance.input.map((x, i) => {
            try {
                return this.g(x, i);
            } catch (_) {
            }
        }).filter(x => x && typeof x.instantiate === "function");
        const n = Capacity.get(this);
        if (isFinite(n)) {
            children = itemsByDuration(children, n).map(([_, item]) => item);
            if (children.length < n) {
                return Fail;
            }
        }

        // Instantiate the generated child elements.
        instance.children = [];
        instance.finished = [];
        const end = Capacity.get(this) === 0 ? t : children.reduce((end, child) => {
            const childInstance = instance.tape.instantiate(child, t);
            return childInstance ? Math.max(
                end,
                endOf(push(instance.children, Object.assign(childInstance, { parent: instance })))
            ) : end;
        }, t);

        if (instance.children.length < children.length) {
            return Fail;
        }

        if (end === t) {
            delete instance.begin;
            instance.t = t;
            if (instance.children.length === 0) {
                instance.value = this.valueForInstance.call(instance);
                instance.parent?.item.childInstanceDidEnd(instance, t);
            }
        } else {
            console.assert(instance.children.length > 0);
            instance.begin = t;
            if (isFinite(end)) {
                instance.end = end;
            }
        }

        if (isFinite(end)) {
            instance.parent?.item.childInstanceEndWasResolved(instance, end);
        }
    },

    // Input values are distributed to the children as their input.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const index = instance.children.indexOf(childInstance);
        console.assert(index >= 0);
        return instance.input[index];
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
    repeat,

    // The duration of a Seq is the sum of the duration of its children.
    // Addition of course gets a little more involved when we take into account
    // unresolved durations (such as folds and maps) and indefinite durations
    // (unbounded repetitions).
    get dur() {
        const n = Capacity.get(this);
        if (n === 0 || (isFinite(n) && this.children.length < n)) {
            return 0;
        }

        let dur = 0;
        const m = min(this.children.length, n);
        for (let i = 0; i < m; ++i) {
            const d = this.children[i].dur;
            if (d === Infinity) {
                // If any duration is indefinite, the total is indefinite.
                return Infinity;
            }
            if (isNaN(d)) {
                // If either duration is unresolved, the sum is unresolved.
                dur = d;
            } else if (!isNaN(dur)) {
                // Simply add two resolved durations.
                dur += d;
            }
        }
        return dur;
    },

    // The value of a Seq is the value of its last child.
    valueForInstance() {
        return this.children?.at(-1)?.value;
    },

    // Fail if not enough children can be instantiated.
    get failible() {
        const n = Capacity.get(this);
        return isFinite(n) && n > this.children.length;
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

    // A Seq instance is an interval (unless all of its children have zero
    // duration), and needs no occurrence of its own (because the children have
    // their own occurrences scheduled as needed), unless it is empty. Fails
    // if any child fails.
    // Instantiate children as long as they have a definite duration. The next
    // children will be instantiated later when resolving the child with an
    // unresolved, or never if the child has an indefinite duration (which is
    // perfectly cromulent and not a failure).
    instantiate(instance, t) {
        if (this.failible) {
            throw Fail;
        }

        instance.children = [];
        const begin = t;
        const n = min(this.children.length, Capacity.get(this));
        for (let i = 0; i < n && isFinite(t); ++i) {
            const childInstance = instance.tape.instantiate(this.children[i], t);
            if (!childInstance) {
                for (const childInstance of instance.children) {
                    childInstance.item.pruneInstance(childInstance);
                }
                throw Fail;
            }
            t = endOf(push(instance.children, Object.assign(childInstance, { parent: instance })));
        }

        if (begin === t) {
            instance.t = t;
            if (instance.children.length === 0) {
                return Object.assign(instance, { forward });
            }
        } else {
            console.assert(instance.children.length > 0);
            instance.begin = begin;
            if (isNumber(t)) {
                instance.end = t;
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
        if (instance.currentChildIndex === min(this.children.length, Capacity.get(this))) {
            instance.value = this.valueForInstance.call(instance);
            instance.end = t;
            instance.parent?.item.childInstanceDidEnd(instance, t);
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
        if (instance.children.length === 0) {
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
    get dur() {
        if (Capacity.get(this) === 0) {
            return 0;
        }
    },

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

        const n = min(xs.length, Capacity.get(this));
        instance.input = xs.slice(0, n);
        instance.children = [];
        for (let i = 0; i < n && isFinite(t); ++i) {
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
};

// Seq/map is just like Seq/fold but taking its initial input from its parent,
// like a normal Seq, and returns a list of its outputs in order.
export const SeqMap = extend(SeqFold, {
    tag: "Seq/map",

    // Collect the values of the children as the value of the map itself.
    valueForInstance() {
        return this.children.map(child => child.value);
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
    get dur() {
        const repeats = Capacity.get(this);
        const dur = repeats === 0 ? 0 : repeats > 0 ? this.child.dur * repeats : Infinity;
        if (!isNaN(dur)) {
            // Limited repetition of an unresolved duration is unresolved,
            // so only return resolved durations.
            return dur;
        }
    },

    // Fails if the inner item fails, or if it has zero duration and repeats
    // indefinitely.
    get failible() {
        if (this.child.failible) {
            return true;
        }
        const n = Capacity.get(this) ?? Infinity;
        return this.child.dur === 0 && n === Infinity;
    },

    instantiate(instance, t) {
        if (this.failible) {
            throw Fail;
        }

        if (Capacity.get(this) === 0) {
            return Object.assign(instance, { t, forward });
        }
        if (this.dur === 0) {
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
    Capacity.set(this, Math.max(0, n));
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
    if (Object.hasOwn(instance, "begin")) {
        if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
        } else {
            console.assert(t > instance.begin);
            instance.end = t;
        }
    }
    if (args.length > 2) {
        instance.value = value;
        instance.parent?.item.childInstanceDidEnd(instance, t);
    }
}

// Minimum function accepting an undefined value as its second argument, for
// use with Capacity.get().
const min = (x, y) => isNumber(y) ? Math.min(x, y) : x;

// Maximum function accepting an undefined value as its second argument, which
// is considered higher than any definite number (for unresolved durations).
const max = (x, y) => isNumber(y) ? Math.max(x, y) : x === Infinity ? x : y;

// Sort a list of items by their duration, optionally capping the list at a
// maximum of n items. Failible items (at instantiation) are filtered out first.
// When an item has an unresolved duration, no sorting occurs and the cap is not
// applied as the eventual order is unknown yet.
function itemsByDuration(items, n) {
    const itemsWithDuration = items.filter(item => !item.failible).map(item => [item.dur, item]);
    if (itemsWithDuration.some(([dur]) => !isNumber(dur))) {
        return itemsWithDuration;
    }
    if (isFinite(n) && n > itemsWithDuration.length) {
        return [];
    }
    itemsWithDuration.sort(([a], [b]) => a - b);
    return n < itemsWithDuration.length ? itemsWithDuration.slice(0, n) : itemsWithDuration;
}
