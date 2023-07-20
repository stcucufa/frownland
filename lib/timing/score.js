import { create, nop } from "../util.js";
import { notify } from "../events.js";
import { Tape } from "../tape.js";

import { show, endOf } from "./util.js";

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
