import { assign, create } from "../lib/util.js";
import { Patch } from "./patch.js";

// Manage a list of patches.
const Patches = assign(() => create().call(Patches), {
    init() {
        this.patches = [];
        window.addEventListener("keyup", this);
    },

    // Keyboard commands for different keys.
    keyboardCommands: {
        // Create a new patch.
        n() {
            const patch = Patch();
            this.patches.push(patch);
            console.log(this.patches.map(patch => patch.id));
        },
    },

    // Listen to keyboard commands.
    handleEvent(event) {
        switch (event.type) {
            case "keyup":
                this.keyboardCommands[event.key]?.call(this);
                break;
        }
    },

});

const patches = Patches();
