import { addBy, create } from "./util.js";

// Create a new tape with Tape(), then call its instantiate() method to
// create new instances from score items and add new occurrences to the tape.
// These can later be removed with removeOccurrence() when instances need to
// be cancelled.
export const Tape = Object.assign(() => create().call(Tape), {
    init() {
        this.erase();
    },

    show() {
        return `Tape<${this.occurrences.map(occurrence => occurrence.t)}>`
    },

    // Instantiate an item beginning at time t with a maximum duration dur, and
    // commit its occurrences to this tape. Return an instance on success or
    // nothing on failure.
    instantiate(item, t, dur, parent) {
        // An instance points to this tape (so that its children can be
        // instantiated in the same tape), its item, and is given an ID for
        // debugging purposes.
        const instance = { tape: this, item, id: `${item.tag}-${this.idCounter++}` };
        try {
            // Item-specific instantiation may return an occurrence or an array
            // of occurrences to be added to the tape.
            const occurrence = item.instantiate(instance, t, dur ?? Infinity, parent);
            if (Array.isArray(occurrence)) {
                for (const o of occurrence) {
                    this.addOccurrence(o);
                }
                this.instances.set(instance, occurrence);
            } else if (occurrence) {
                this.instances.set(instance, this.addOccurrence(occurrence));
            }
            // Set the parent before returning the instance.
            if (parent) {
                instance.parent = parent;
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

        // Find the index of the first occurrence in the interval (if any).
        let i = this.occurrences.findIndex(o => typeof o.forward === "function" && o.t >= from && o.t < to);
        if (i < 0) {
            return;
        }

        const occurred = new Set();
        while (i < this.occurrences.length) {
            occurred.add(this.occurrences[i]);
            const t = this.occurrences[i].t;
            yield this.occurrences[i];

            // Check if no instance was added at the same instant but with a
            // lower index (e.g., cancelling an element that comes before in
            // the instance tree).
            for (let j = i - 1; j >= 0; --j) {
                const o = this.occurrences[j];
                if (o?.t < t) {
                    break;
                }
                if (o && !occurred.has(o) && typeof o.forward === "function") {
                    i = j;
                }
            }

            while (i < this.occurrences.length) {
                const o = this.occurrences[i];
                if (o.t >= to) {
                    return;
                }
                if (!occurred.has(o) && typeof o.forward === "function" && o.t >= from && o.t < to) {
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
        addBy(this.occurrences, occurrence, o => after(o, occurrence));
        return occurrence;
    },

    // Remove an occurrence from the tape (this is used when cancelling).
    removeOccurrence(occurrence) {
        const index = this.occurrences.indexOf(occurrence);
        if (index >= 0) {
            return this.occurrences.splice(index, 1)[0];
        }
    },

    // Remove the occurrence for an instance by looking it up in the
    // instance map.
    removeOccurrenceForInstance(instance) {
        const occurrence = this.instances.get(instance);
        if (Array.isArray(occurrence)) {
            for (const o of occurrence) {
                this.removeOccurrence(o);
            }
        } else {
            this.removeOccurrence(occurrence);
        }
        this.instances.delete(instance);
        return occurrence;
    },

    // Erase all occurrences from the tape.
    erase() {
        this.idCounter = 0;
        this.instances = new Map();
        this.occurrences = [];
    },
});

// True if occurrence a is after occurrence b. When both have the same time,
// check the instance tree to find which comes first.
function after(a, b) {
    // Occurrences are derived from instances, so find the actual instance
    // object from an occurrence to go up the tree.
    const unwrap = o => Object.hasOwn(o, "id") ? o : unwrap(Object.getPrototypeOf(o));
    if (a.t === b.t) {
        // Find the lowest common ancestor (if any) between a and b. Do so by
        // going up the tree from a, recording the position of each ancestor
        // node in its parent’s list of children.
        const path = new Map();
        let p = unwrap(a);
        while (p.parent) {
            path.set(p.parent, p.parent.children.indexOf(p));
            p = p.parent;
        }
        // Then go up from b until a node in the path from a is found, which is
        // the common ancestor. The positions in the child list of this ancestor
        // can then be compared to find out whether a comes after b.
        let q = unwrap(b);
        while (q.parent) {
            let i = q.parent.children.indexOf(q);
            q = q.parent;
            if (path.has(q)) {
                return path.get(q) > i;
            }
        }
        return false;
    }
    return a.t > b.t;
}
