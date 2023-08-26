import { extend } from "../util.js";
import { notify } from "../events.js";
import {
    cancelled, dur, ended, failed, hasModifier, inputParameters, min, pruned, varModifier,
    Item, _Item, CancelError, TimeoutError
} from "./util.js";

// Schedule an async function and await its return.
export const Await = Item(["instanceDidBegin"], extend(_Item, {
    tag: "Await",
    dur,
    var: varModifier,

    // The duration is unresolved unless it was explicitly set with dur().
    get duration() {
        return this.modifiers?.dur;
    },

    // Await fails if its duration is 0.
    get fallible() {
        return this.modifiers?.dur === 0;
    },

    // Schedule f to run when the instance begins and wait for the return value.
    // The deck will send an `await` notification when the call ends, regardless
    // of whether this is a success or failure.
    instantiate(instance, t, dur) {
        instance.begin = t;
        const end = t + min(dur, this.modifiers?.dur);
        if (end <= t) {
            // Duration must be greater than zero.
            throw FailureError;
        }

        if (hasModifier(this, "dur")) {
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
                    try {
                        this.instanceDidBegin.call(
                            instance, inputParameters(instance), t, interval
                        ).then(value => {
                            if (!(instance.error === CancelError)) {
                                v.push(value);
                            }
                            notify(instance.tape.deck, "await", { instance });
                        }).catch(error => {
                            if (!instance.error) {
                                // The instance may have ended already because
                                // it timed out or was cancelled, so ignore the
                                // error.
                                failed(
                                    instance, instance.tape.deck.instantAtTime(performance.now()), error
                                );
                                instance.tape.removeOccurrenceForInstance(instance);
                            }
                            notify(instance.tape.deck, "await", { instance });
                        });
                    } catch (error) {
                        failed(instance, t, error);
                    }
                } }),
                // End with the stored value, or fail.
                extend(instance, { t: instance.end, forward(t) {
                    console.assert(t === instance.end);
                    if (v.length === 1) {
                        instance.value = v[0];
                    } else {
                        instance.error = TimeoutError;
                    }
                    instance.parent?.item.childInstanceDidEnd(instance);
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
            try {
                this.instanceDidBegin.call(
                    instance, inputParameters(instance), t, interval
                ).then(value => {
                    const deck = instance.tape.deck;
                    if (!instance.error) {
                        if (hasDuration) {
                            instance.tape.removeOccurrenceForInstance(instance);
                        }
                        ended(instance, deck.instantAtTime(performance.now()), value, true);
                    }
                    notify(deck, "await", { instance });
                }).catch(error => {
                    failed(instance, instance.tape.deck.instantAtTime(performance.now()), error);
                    notify(instance.tape.deck, "await", { instance });
                });
            } catch (error) {
                failed(instance, t, error);
            }
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
}));
