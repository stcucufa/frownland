import { assign, extend } from "../util.js";
import {
    cancelled, dur, ended, failed, hasModifier, min,
    FailureError, TimeoutError
} from "./util.js";
import { repeat } from "./repeat.js";

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

    // The event has occurred for an instance at time t. It ends now with the
    // event as value, unless it has a duration, in which case it holds to that
    // value (unless the event occurs too late, but the instance already
    // failed).
    eventDidOccur(instance, event, t) {
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
}));
