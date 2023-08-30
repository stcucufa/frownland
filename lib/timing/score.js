import { assign, create, nop } from "../util.js";
import { notify } from "../events.js";
import { Tape } from "../tape.js";
import { endOf, show } from "./util.js";

// The score is the root of the tree of timing items.
export const Score = assign(properties => create(properties).call(Score), {
    tag: "Score",
    show,

    // Set up children and tape.
    init() {
        this.children = [];
        this.begins = new Map();
        this.tape ??= Tape();
        this.instance = this.tape.instantiate(this, 0, Infinity);
    },

    // Clear the tape and instantiate all children again.
    reset() {
        this.tape.erase();
        this.instance = this.tape.instantiate(this, 0, Infinity);
        for (const child of this.children) {
            this.instance.children.push(this.tape.instantiate(
                child, this.begins.get(child), this.instance.end - this.instance.begin, this.instance
            ));
        }
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
        const t = at ?? this.tape.deck?.now ?? 0;
        this.begins.set(item, t);
        this.instance.children.push(this.tape.instantiate(
            item, t, this.instance.end - this.instance.begin, this.instance
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
