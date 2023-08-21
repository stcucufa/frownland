import { assign, extend, K } from "../util.js";
import { Tape } from "../tape.js";
import {
    cancelled, dur, ended, failed, hasModifier, label, min,
    FailureError, TimeoutError
} from "./util.js";

// Event ends when the first occurrence of an event occurs with the event
// object as its value. This relies on the deck’s event handler.
export const Event = assign((target, event, child) => extend(Event, { target, event, child }), {
    tag: "Event",

    init() {
        if (this.child) {
            if (Object.hasOwn(this.child, "parent")) {
                throw window.Error("Cannot share item between containers");
            }
            this.child.parent = this;
        }
    },

    show() {
        return `${this.tag}<${this.target}, ${this.event}>`;
    },

    label,
    dur,

    // The duration is unresolved unless it was explicitly set with dur().
    get duration() {
        return this.modifiers?.dur;
    },

    // Event fails if its duration is 0.
    get fallible() {
        return this.modifiers?.dur === 0;
    },

    // Instantiate simply registers the instance wit the generic event handler
    // and does not create any new occurrence, unless the duration is
    // constrained (either by dur() or the parent container).
    instantiate(instance, t, dur) {
        const end = t + min(dur, this.modifiers?.dur);
        if (end <= t) {
            // Duration must be greater than zero.
            throw FailureError;
        }

        instance.begin = t;
        if (isFinite(end)) {
            instance.end = end;
        }
        instance.tape.deck.addEventTarget(instance);

        if (hasModifier(this, "dur")) {
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
                instance.parent?.item.childInstanceDidEnd(instance);
            } });
        }

        if (isFinite(end)) {
            return extend(instance, { t: end, forward: t => {
                failed(instance, t, TimeoutError);
            } });
        }
    },

    // When the event occurs and there is a child item, instantiate it in a
    // separate tape with zero duration, and run the occurrences from that tape
    // immediately. If no occurrences were created, then proceed to end with
    // the event that occurred.
    eventDidOccur(instance, event, t) {
        let handled = false;
        if (this.child) {
            const tape = Tape();
            tape.instantiate(this.child, t, 0, {
                // Create a foster parent that feeds the event as the input
                // value for its child and ends with a possibly altered event
                // value.
                item: {
                    inputForChildInstance: K(event),
                    childInstanceDidEnd: childInstance => {
                        this.handledEvent(instance, childInstance.value, t);
                    }
                }
            });
            const interval = { from: t, to: Infinity };
            for (const occurrence of tape.occurrencesInInterval(interval)) {
                console.assert(occurrence.t === t);
                occurrence.forward(occurrence.t, interval);
                handled = true;
            }
        }
        if (!handled) {
            return this.handledEvent(instance, event, t);
        }
    },

    // The event has occurred for an instance at time t. It ends now with the
    // event as value, unless it has a duration, in which case it holds to that
    // value (unless the event occurs too late, but the instance already
    // failed).
    handledEvent(instance, event, t) {
        if (hasModifier(this, "dur")) {
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
            ended(instance, t, event, true);
        }
    },

    // When cancelling, there is no occurrence to remove, but we may need to
    // remove the event listener.
    cancelInstance(instance, t) {
        cancelled(instance, t);
        instance.tape.deck.removeEventTarget(instance);
    },

    // When pruning, there is no occurrence to remove, but we may need to
    // remove the event listener.
    pruneInstance(instance) {
        delete instance.parent;
        instance.tape.deck.removeEventTarget(instance);
    }
});
