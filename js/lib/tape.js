import { addBy, create } from "./util.js";

// Create a new tape with Tape(), then call its instantiate() method to
// create new instances from score items and add new occurrences to the tape.
// These can later be removed with removeOccurrence() when instances need to
// be cancelled.
export const Tape = Object.assign(() => create().call(Tape), {
    init() {
        this.idCounter = 0;
        this.instances = new Map();
        this.occurrences = [];
    },

    show() {
        return `Tape<${this.occurrences.map(occurrence => occurrence.t)}>`
    },

    // Instantiate an item beginning at time t with a maximum duration dur, and
    // commit its occurrences to this tape. Return an instance on success or
    // nothing on failure.
    instantiate(item, t, dur = Infinity) {
        // An instance points to this tape (so that its children can be
        // instantiated in the same tape), its item, and is given an ID for
        // debugging purposes.
        const instance = { tape: this, item, id: `${item.tag}-${this.idCounter++}` };
        try {
            // Item-specific instantiation may return an occurrence to be added
            // to the tape.
            const occurrence = item.instantiate(instance, t, dur);
            if (occurrence) {
                this.instances.set(instance, this.addOccurrence(occurrence));
            }
            return instance;
        } catch (_) {
            // Instantiation failed (e.g., an infinite repeat with zero
            // duration); the instance should be discarded.
        }
    },

    // When the deck is playing, it is calling this generator repeatedly to
    // get all occurrences in the given interval. Since new occurrences may
    // be added as the result of running an occurrence (see for instance
    // Par.map or Seq.fold), they will run as expected if they fall within the
    // interval.
    *occurrencesInInterval(interval) {
        const { from, to } = interval;
        let i = this.occurrences.findIndex(o => typeof o.forward === "function" && o.t >= from && o.t < to);
        if (i < 0) {
            return;
        }

        while (i < this.occurrences.length) {
            yield this.occurrences[i++];
            while (i < this.occurrences.length) {
                const o = this.occurrences[i];
                if (o.t >= to) {
                    return;
                }
                if (typeof o.forward === "function" && o.t >= from && o.t < to) {
                    break;
                }
                i += 1;
            }
        }
    },

    // Add a new occurrence to the tape. The occurrences are kept sorted by
    // their time t.
    addOccurrence(occurrence) {
        console.assert(isFinite(occurrence.t));
        addBy(this.occurrences, occurrence, o => o.t > occurrence.t);
        return occurrence;
    },

    // Remove an occurrence from the tape (this is used when cancelling).
    removeOccurrence(occurrence) {
        const index = this.occurrences.indexOf(occurrence);
        console.assert(index >= 0);
        return this.occurrences.splice(index, 1)[0];
    },

    // Remove the occurrence for an instance by looking it up in the
    // instance map.
    removeOccurrenceForInstance(instance) {
        const occurrence = this.removeOccurrence(this.instances.get(instance));
        this.instances.delete(instance);
        return occurrence;
    }
});
