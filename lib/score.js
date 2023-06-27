import { assign, create, extend, I, isNumber, nop, partition, push, remove } from "./util.js";
import { notify } from "./events.js";
import { Tape } from "./tape.js";

const CancelError = window.Error("cancel");
const FailureError = window.Error("failed");
const InputError = window.Error("input");
const TimeoutError = window.Error("timeout");
const RepeatMax = 777;

const Capacity = new Map(); // capacity for items, set by take()
const Duration = new Map(); // duration for items, set by dur()

// The score is the root of the tree of timing items.
export const Score = Object.assign(properties => create(properties).call(Score), {
    tag: "Score",
    show,

    // Set up children and tape.
    init() {
        this.children = [];
        this.tape ??= Tape();
        this.instance = this.tape.instantiate(this, 0, Infinity);
    },

    // Instantiate the score to fill up the entire available duration.
    instantiate(instance, t, dur) {
        if (!(dur > 0)) {
            throw FailureError;
        }
        instance.begin = t;
        instance.end = t + dur;
        instance.children = [];
    },

    // Add an item to the score and instantiate it. The item is returned.
    add(item, at) {
        console.assert(!Object.hasOwn(item, parent));
        this.children.push(item);
        item.parent = this;
        this.instance.children.push(this.tape.instantiate(
            item, at ?? this.tape.deck?.now ?? 0, this.instance.end - this.instance.begin, this.instance
        ));
        return item;
    },

    // Send a notification with the value of the child instance when it ends.
    childInstanceDidEnd(childInstance) {
        console.assert(childInstance.parent === this.instance);
        const event = { t: endOf(childInstance), item: childInstance.item };
        if (childInstance.error) {
            event.error = childInstance.error;
        } else {
            event.value = childInstance.value;
        }
        notify(this.tape, "end", event);
    },

    inputForChildInstance: nop,
    childInstanceEndWasResolved: nop,
});

// Instant(f) evaluates f instantly. f should not have any side effect and
// defaults to I (identity). Repeatable, cannot fail.
export const Instant = assign(f => f ? extend(Instant, { valueForInstance: f }) : Object.create(Instant), {
    tag: "Instant",
    show,
    repeat,

    // If a valid duration is set, then this is wrapped into a Seq.
    dur(d) {
        return d > 0 ? Seq([Delay(d), this]) : this;
    },

    // An instant has no duration.
    get duration() {
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

// Effect is similar to Instant but has side effects.
export const Effect = assign(f => extend(Instant, {
    valueForInstance: f,
    tag: "Effect",
    hasEffect: true,

    // Effect cannot be cancelled (but can be pruned of course).
    cancelInstance: nop,
}));

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

    // Create a new DelayUntil item.
    until(t) {
        console.assert(this === Delay);
        return t > 0 ? DelayUntil(t) : Instant();
    },

    // The instance for a delay is an interval, with an occurrence at the end
    // of the interval. The parent duration may cut off the delay, which is
    // reported by the instance.
    instantiate(instance, t, dur) {
        if (dur === 0) {
            // This is a degenerate case where the delay must fit in zero
            // duration.
            return Object.assign(instance, { t, cutoff: true, forward });
        }
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

// Delay until time t relative to the begin of the parent. If the delay begins
// after the requested time, this acts just like an Instant. Not failible, and
// *not* repeatable (since the delay can apply at most once).
const DelayUntil = assign(t => extend(DelayUntil, { t }), {
    tag: "Delay/until",

    get duration() {},

    show() {
        return `${this.tag}<${this.t}>`;
    },

    // Instantiate an interval, unless the time for the delay has already
    // passed, in which case this is just an instant.
    instantiate(instance, t, dur, parent) {
        const maxEnd = t + dur;
        const itemEnd = (beginOf(parent) ?? t) + this.t;
        const end = min(itemEnd, maxEnd);
        if (itemEnd > maxEnd) {
            // There is a delay but it is cutoff from the desired duration.
            instance.cutoff = true;
        }
        if (end <= t) {
            // The time has already passed.
            return Object.assign(instance, { t, forward });
        }
        instance.begin = t;
        instance.end = end;
        return extend(instance, { t: end, forward });
    },

    valueForInstance: I,
    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Schedule an async function and await its return.
export const Await = assign(f => extend(Await, { instanceDidBegin: f }), {
    tag: "Await",
    show,
    repeat,
    dur,

    // The duration is unresolved unless it was explicitly set with dur().
    get duration() {
        if (Duration.has(this)) {
            return Duration.get(this);
        }
    },

    // Await fails if its duration is 0.
    get failible() {
        return Duration.get(this) === 0;
    },

    // Schedule f to run when the instance begins and wait for the return value.
    // The deck will send an `await` notification when the call ends, regardless
    // of whether this is a success or failure.
    instantiate(instance, t, dur) {
        instance.begin = t;
        const end = t + min(dur, Duration.get(this));
        if (end <= t) {
            // Duration must be greater than zero.
            throw FailureError;
        }

        if (Duration.has(this)) {
            // Await has an exact duration; if the call finishes earlier, its
            // value is stored and the instance will finish at the end of its
            // duration with that value. If the call does not finish on time,
            // the instance fails and the return value is ignored. This requires
            // an extra occurrence at the end of the interval.
            instance.end = end;
            // A cheap way to represent an optional value which can still be
            // undefined.
            const v = [];
            return [
                // Call the async function and store its return value.
                extend(instance, { t, forward: (t, interval) => {
                    console.assert(t === instance.begin);
                    this.instanceDidBegin.call(
                        instance, instance.parent?.item.inputForChildInstance(instance), t, interval
                    ).then(value => {
                        if (!(instance.error === CancelError)) {
                            v.push(value);
                        }
                        notify(instance.tape.deck, "await", { instance });
                    }).catch(error => {
                        failed(instance, instance.tape.deck.instantAtTime(performance.now()), error);
                        instance.tape.removeOccurrenceForInstance(instance);
                        notify(instance.tape.deck, "await", { instance });
                    });
                } }),
                // End with the stored value, or fail.
                extend(instance, { t: instance.end, forward(t) {
                    console.assert(t === instance.end);
                    if (v.length === 1) {
                        instance.value = v[0];
                    } else {
                        instance.error = TimeoutError;
                    }
                    instance.parent?.item.childInstanceDidEnd(instance, t);
                } })
            ];
        }

        // The duration may be constained by the parent, so the instance still
        // fails if the call does not return on time. Otherwise, it finishes as
        // soon as the call returns.
        const hasDuration = isFinite(end);
        if (hasDuration) {
            instance.end = end;
        }

        // Call the async function on begin and wait for its return value to
        // resolve the instance.
        const occurrence = extend(instance, { t, forward: (t, interval) => {
            console.assert(t === instance.begin);
            this.instanceDidBegin.call(
                instance, instance.parent?.item.inputForChildInstance(instance), t, interval
            ).then(value => {
                const deck = instance.tape.deck;
                if (!instance.error) {
                    if (hasDuration) {
                        instance.tape.removeOccurrenceForInstance(instance);
                    }
                    instance.value = value;
                    instance.end = deck.instantAtTime(performance.now());
                    console.assert(instance.end > instance.begin);
                    instance.parent?.item.childInstanceEndWasResolved(instance, instance.end);
                    instance.parent?.item.childInstanceDidEnd(instance, instance.end);
                }
                notify(deck, "await", { instance });
            }).catch(error => {
                failed(instance, instance.tape.deck.instantAtTime(performance.now()), error);
                notify(instance.tape.deck, "await", { instance });
            });
        } });

        // Add an extra occurrence to timeout if the call did not finish on time
        // when the duration is constrained.
        return hasDuration ? [occurrence, extend(instance, {
            t: instance.end,
            forward(t) {
                failed(instance, t, TimeoutError);
            }
        })] : occurrence;
    },

    cancelInstance: cancelled,
    pruneInstance: pruned,
});

// Event ends when the first occurrence of an event occurs with the event
// object as its value. This relies on the deck’s event handler.
export const Event = assign((target, event) => extend(Event, { target, event }, {
    tag: "Event",

    show() {
        return `${this.tag}<${this.target}, ${this.event}>`;
    },

    repeat,
    dur,

    // The duration is unresolved unless it was explicitly set with dur().
    get duration() {
        if (Duration.has(this)) {
            return Duration.get(this);
        }
    },

    // Event fails if its duration is 0.
    get failible() {
        return Duration.get(this) === 0;
    },

    // Instantiate simply registers the instance wit the generic event handler
    // and does not create any new occurrence, unless the duration is
    // constrained (either by dur() or the parent container).
    instantiate(instance, t, dur) {
        const end = t + min(dur, Duration.get(this));
        if (end <= t) {
            // Duration must be greater than zero.
            throw FailureError;
        }

        instance.begin = t;
        if (isFinite(end)) {
            instance.end = end;
        }
        instance.tape.deck.addEventTarget(instance);

        if (Duration.has(this)) {
            // Event has a definite duration; if the event occurs earlier, it
            // is stored and the instance will finish at the end of its
            // duration with that event as value. If the event does not occur
            // by the scheduled end of the instance, then it fails and the event
            // listener can be removed.
            return extend(instance, { t: end, forward: t => {
                console.assert(t === instance.end);
                const value = instance.delayedEvent;
                delete instance.delayedEvent;
                if (value) {
                    instance.value = value;
                } else {
                    instance.error = TimeoutError;
                }
                instance.parent?.item.childInstanceDidEnd(instance, t);
            } });
        }

        if (isFinite(end)) {
            return extend(instance, { t: end, forward: t => {
                failed(instance, t, TimeoutError);
            } });
        }
    },

    // The event has occurred for an instance at time t. It ends now with the
    // event as value, unless it has a duration, in which case it holds to that
    // value (unless the event occurs too late, but the instance already
    // failed).
    eventDidOccur(instance, event, t) {
        if (Duration.has(this)) {
            // Store the event value until the instance ends.
            instance.delayedEvent = event;
        } else if (t > instance.end) {
            // The event occurs too late so the instance has failed.
            console.assert(instance.error === TimeoutError);
        } else {
            // The instance may have a maximum duration enforced by
            // an occurrence that needs to be cleared.
            if (t <= instance.end) {
                instance.tape.removeOccurrenceForInstance(instance);
            }
            instance.value = event;
            instance.end = t;
            instance.parent?.item.childInstanceEndWasResolved(instance, t);
            instance.parent?.item.childInstanceDidEnd(instance, t);
        }
    },

    // When cancelling, there is no occurrence to remove, but we may need to
    // remove the event listener.
    cancelInstance(instance, t) {
        ended(instance, t);
        instance.error = CancelError;
        instance.tape.deck.removeEventTarget(instance);
    },

    // When pruning, there is no occurrence to remove, but we may need to
    // remove the event listener.
    pruneInstance(instance) {
        delete instance.parent;
        instance.tape.deck.removeEventTarget(instance);
    }
}));

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
    get failible() {
        return this.failibleChildren(this.children);
    },

    failibleChildren(children) {
        const failingChildCount = children.filter(child => child.failible).length;
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
        if (this.failibleChildren(children)) {
            throw FailureError;
        }

        // itemDur is the duration potentially set by .dur(), which may be
        // lower than the available duration so we take the minimum value.
        const itemDur = Duration.get(this);
        dur = min(dur, itemDur);

        // Gather the children and instantiate them.
        if (Capacity.has(this)) {
            instance.capacity = Capacity.get(this);
            children = (xs => xs.map(([_, x]) => x))(itemsByDuration(children, instance.capacity));
        }
        // Set the capacity to exactly how many children are expected to finish.
        if (!isFinite(instance.capacity)) {
            instance.capacity = children.length;
        }
        instance.children = children.map(child => {
            const childInstance = instance.tape.instantiate(child, t, dur, instance);
            if (childInstance.cutoff) {
                instance.cutoff = true;
                delete childInstance.cutoff;
            }
            return childInstance;
        });
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
        if (!instance.finished) {
            // The instance has already finished (this is a lingering effect).
            return;
        }

        // When a child fails at runtime, the par itself may fail if not enough
        // children can succeed to fill its capacity.
        if (childInstance.error) {
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
        } else {
            instance.finished.push(childInstance);
            if (instance.finished.length === instance.capacity) {
                for (const child of instance.children) {
                    if (instance.finished.indexOf(child) < 0) {
                        child.item.cancelInstance(child, t);
                    }
                }
                ended(instance, t, this.valueForInstance.call(instance));
            }
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
            if (isNumber(instance.end)) {
                console.assert(instance.end >= t);
            } else {
                if (instance.begin === end) {
                    delete instance.begin;
                    instance.t = end;
                } else {
                    instance.end = end;
                }
                instance.parent?.item.childInstanceEndWasResolved(instance, end);
            }
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
    get failible() {
        return false;
    },

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
            if (child.failible) {
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
    get failible() {
        return this.durationForChildren(this.children) === null;
    },

    // The value of a Seq is the value of its last child.
    valueForInstance() {
        return this.children?.at(-1)?.value;
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
        if (this.failible) {
            throw FailureError;
        }

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
        instance.capacity = min(this.children.length, Capacity.get(this));
        instance.begin = t;
        for (let i = 0; i < instance.capacity && t <= end; ++i) {
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
                instance.capacity = min(instance.children.length, Capacity.get(this));
                instance.cutoff = true;
                break;
            }
        }

        if (Duration.has(this)) {
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
    childInstanceEndWasResolved(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        const n = min(this.children.length, Capacity.get(this));

        if (childInstance.cutoff) {
            // Stop instantiation here.
            delete childInstance.cutoff;
            instance.capacity = min(instance.children.length, Capacity.get(this));
            instance.cutoff = true;
        } else {
            // Continue instantiation starting from the next child.
            const m = instance.children.length;
            for (let i = m; i < n && t <= instance.maxEnd; ++i) {
                const childInstance = instance.tape.instantiate(
                    this.children[i], t, instance.maxEnd - t, instance
                );
                if (!childInstance) {
                    for (let j = m; j < i; ++j) {
                        instance.children[j].item.pruneInstance(instance.children[j]);
                    }
                    instance.children.length = m;
                    failed(instance, t);
                    return;
                }
                t = endOf(push(instance.children, childInstance));

                // If a child instance is cut off then we cannot go any further.
                if (childInstance.cutoff) {
                    delete childInstance.cutoff;
                    instance.capacity = min(instance.children.length, Capacity.get(this));
                    instance.cutoff = true;
                    break;
                }
            }
        }

        if (Duration.has(this)) {
            // The end was already set.
            return;
        }

        if (instance.children.length === n && isNumber(t)) {
            if (instance.begin === t) {
                delete instance.begin;
                instance.t = t;
            } else {
                instance.end = t;
            }
            instance.parent?.item.childInstanceEndWasResolved(instance, t);
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

        // Fail if a child fails; prune all children following the failed child.
        if (childInstance.error) {
            const n = instance.currentChildIndex + 1;
            for (let i = n; i < instance.children.length; ++i) {
                const child = instance.children[i];
                child.item.pruneInstance(child, t);
                delete child.parent;
            }
            instance.children.length = n;
            failed(instance, t);
            delete instance.currentChildIndex;
        } else {
            console.assert(instance.children[instance.currentChildIndex] === childInstance);
            instance.currentChildIndex += 1;
            if (instance.currentChildIndex === instance.capacity) {
                instance.value = this.valueForInstance.call(instance);
                if (!Duration.has(instance.item)) {
                    instance.end = t;
                }
                instance.parent?.item.childInstanceDidEnd(instance, instance.end);
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

// Repeat is a special kind of Seq that keeps instantiating its child when it
// finishes and never ends (unless capped by take()).
const Repeat = assign(child => extend(Repeat, { child }), {
    tag: "Seq/repeat",
    show,
    init,
    take,
    dur,

    // Duration is indefinite, unless it is modified by take in which case it
    // is a product of the number of iterations by the duration of the item
    // being repeated.
    get duration() {
        if (Duration.has(this)) {
            return Duration.get(this);
        }
        const repeats = Capacity.get(this);
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
    get failible() {
        if (this.child.failible) {
            return true;
        }
        const n = Capacity.get(this) ?? Infinity;
        return this.child.duration === 0 && n === Infinity;
    },

    // Instantiate the first iteration of the repeat, or immediately return a
    // single occurrence if there are no iterations.
    instantiate(instance, t, dur) {
        if (this.failible) {
            throw FailureError;
        }

        if (Capacity.get(this) === 0) {
            return Object.assign(instance, { t, forward });
        }

        instance.maxEnd = t + min(dur, Duration.get(this));
        instance.capacity = Capacity.get(this) ?? Infinity;
        if (instance.maxEnd === t) {
            instance.t = t;
        } else {
            instance.begin = t;
            if (Duration.has(this)) {
                instance.end = instance.maxEnd;
            }
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
    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);

        // Fail if the child fails.
        if (childInstance.error) {
            console.assert(childInstance === instance.children.at(-1));
            failed(instance, t);
        } else {
            if (childInstance.cutoff) {
                delete childInstance.cutoff;
                if (isFinite(instance.capacity)) {
                    return failed(instance, t);
                }
                instance.cutoff = true;
                return ended(instance, t, childInstance.value);
            }

            if (instance.children.length > RepeatMax) {
                // This is just for debug purposes and should be removed eventually.
                throw window.Error("Too many repeats");
            }
            if (instance.children.length === instance.capacity) {
                instance.parent?.item.childInstanceEndWasResolved(instance, t);
                ended(instance, t, childInstance.value);
            } else {
                instance.children.push(
                    instance.tape.instantiate(this.child, t, instance.maxEnd - t, instance)
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

    valueForInstance: I,
    childInstanceEndWasResolved: nop,
});

// Seq/fold is similar to Seq but its children are produced by mapping its
// input through the g function, and the initial value of the fold is given by
// z. The initial instantiation is an interval with an unresolved end time and
// an occurrence to instantiate the contents.
const SeqFold = {
    tag: "Seq/fold",
    show,
    take,
    dur,
    repeat,

    // Duration is unresolved, unless it is specified by dur() or modified by
    // take(0).
    get duration() {
        if (Duration.has(this)) {
            return Duration.get(this);
        }
        if (Capacity.get(this) === 0) {
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
        if (Capacity.get(this) === 0) {
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

        const end = t + min(dur, Duration.get(this));

        // Check that we have the right number of input values.
        const n = Capacity.get(this);
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
        for (let i = 0; i < instance.capacity && t <= end; ++i) {
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

        if (Duration.has(this)) {
            t = end;
        }

        if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
            instance.value = this.valueForInstance.call(instance);
            if (instance.children.length === 0) {
                instance.parent?.item.childInstanceDidEnd(instance, t);
            }
        } else {
            if (isNumber(t)) {
                instance.end = t;
            }
            if (instance.children.length === 0) {
                console.assert(isNumber(t));
                instance.parent?.item.childInstanceDidEnd(instance, t);
            }
        }

        if (isNumber(t)) {
            instance.parent?.item.childInstanceEndWasResolved(instance, t);
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
    childInstanceEndWasResolved(childInstance, t) {
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
            for (let i = m; i < instance.capacity && t <= instance.maxEnd; ++i) {
                let childItem;
                try {
                    childItem = this.g(instance.input[i], i);
                } catch {
                    return failed(instance, t, InputError);
                }
                const childInstance = instance.tape.instantiate(
                    childItem, t, instance.maxEnd - t, instance
                );
                if (!childInstance) {
                    for (let j = m; j < i; ++j) {
                        instance.children[j].item.pruneInstance(instance.children[j]);
                    }
                    instance.children.length = m;
                    failed(instance, t);
                    return;
                }
                t = endOf(push(instance.children, childInstance));

                // If a child instance is cut off then we cannot go any further
                if (childInstance.cutoff) {
                    delete childInstance.cutoff;
                    instance.capacity = min(instance.children.length, Capacity.get(this));
                    instance.cutoff = true;
                }
            }
        }

        if (Duration.has(this)) {
            // The end was already set.
            return;
        }

        if (instance.children.length === instance.input.length && isNumber(t)) {
            if (instance.begin === t) {
                delete instance.begin;
                instance.t = t;
            } else {
                instance.end = t;
            }
            instance.parent?.item.childInstanceEndWasResolved(instance, t);
        } else if (t === Infinity) {
            instance.end = t;
        }
    },

    childInstanceDidEnd: Seq.childInstanceDidEnd,
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

// Try wraps a child with an error child that gets instantiated with the error
// if the child fails, similar to a try/catch block.
export const Try = assign((child, _catch) => create().call(Try, { child, catch: _catch }), {
    tag: "Try",
    init,

    show() {
        return this.tag;
    },

    get children() {
        return [this.child, this.catch];
    },

    // Duration is unresolved unless both child and error have zero duration.
    get duration() {
        if (this.child.duration === 0 && this.catch.duration === 0) {
            return 0;
        }
    },

    // Failible when the child is failible.
    get failible() {
        return this.child.failible;
    },

    instantiate(instance, t, dur) {
        if (this.duration === 0) {
            instance.t = t;
        } else {
            instance.begin = t;
        }
        const child = instance.tape.instantiate(this.child, t, dur, instance);
        if (child) {
            instance.children = [child];
            instance.maxEnd = t + dur;
        } else {
            instance.caughtError = FailureError;
            const catchChild = instance.tape.instantiate(this.catch, t, dur, instance);
            if (!catchChild) {
                throw FailureError;
            } else {
                instance.children = [catchChild];
            }
        }
    },

    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.caughtError ?? this.parent?.inputForChildInstance(instance);
    },

    childInstanceDidEnd(childInstance, t) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);

        function ended() {
            delete instance.caughtError;
            delete instance.maxEnd;
            if (instance.begin >= 0) {
                if (t === instance.begin) {
                    console.assert(childInstance.t === t);
                    delete instance.begin;
                    instance.t = t;
                } else {
                    instance.end = t;
                }
                instance.parent?.item.childInstanceEndWasResolved(instance, t);
            }
            instance.parent?.item.childInstanceDidEnd(instance, t);
        }

        if (childInstance.error) {
            if (childInstance.item === this.child) {
                // There was an error, so try to recover.
                instance.caughtError = childInstance.error;
                instance.children.push(
                    instance.tape.instantiate(this.catch, t, instance.maxEnd - t, instance)
                );
            } else {
                // There was an error that could not be recovered.
                instance.error = childInstance.error;
                ended();
            }
        } else {
            // No error, or we could recover.
            instance.value = childInstance.value;
            ended();
        }
    },

    // Deal with child duration when it ends, because we don’t know yet if it
    // has succeeded or not.
    childInstanceEndWasResolved: nop,
});

// Dump an instance and its children for debugging and testing.
export function dump(instance, indent = "* ") {
    const selfDump = `${indent}${instance.id} ${
        Object.hasOwn(instance, "begin") ? `[${instance.begin}, ${
            isFinite(instance.end) ? instance.end : "∞"
        }[` : `@${instance.t}`
    }${
        instance.error === CancelError ? " (cancelled)" :
        instance.error === FailureError ? " (failed)" :
        instance.error === InputError ? " (input error)" :
        instance.error === TimeoutError ? " (timeout)" :
        Object.hasOwn(instance, "error") ? ` error<${instance.error.message ?? instance.error}>` :
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
    if (d >= 0) {
        Duration.set(this, d);
    }
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
    try {
        instance.value = item.valueForInstance.call(
            instance, instance.parent?.item.inputForChildInstance(instance), t, interval
        );
    } catch (error) {
        instance.error = error;
    }
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
    instance.error = CancelError;
    instance.tape.removeOccurrenceForInstance(instance);
}

// When an instance fails, it ends, store the error that caused the failure in
// the error property and notifies its parent.
function failed(instance, t, error = FailureError) {
    ended(instance, t);
    instance.error = error;
    instance.parent?.item.childInstanceDidEnd(instance, t);
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

// Select at least n items from the list according to their duration, keeping
// them in their original order, and return [duration, item] pairs. Failible
// items are sorted out. Note that more than n items may be returned since
// items with unresolved duration and items with effect still begin; and zero
// items are returned when there is an insufficient number of items to fulfill
// the constraint.
function itemsByDuration(items, n) {
    if (n === 0) {
        return [];
    }
    const itemsWithDuration = items.filter(item => !item.failible).map(item => [item.duration, item]);
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
    const selectedItems = new Set(unresolved.concat(resolved.slice(0, n)));
    return selectedItems.length === m ?
        itemsWithDuration : itemsWithDuration.filter(item => selectedItems.has(item));
}
