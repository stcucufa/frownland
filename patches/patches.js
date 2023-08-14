import { assign, create, html } from "../lib/util.js";
import { notify, on } from "../lib/events.js";
import { Patch, PatchView } from "./patch.js";

// Manage a list of patches.
const Patches = assign(() => create().call(Patches), {
    init() {
        this.patches = [];
    },

    addPatch(patch) {
        this.patches.push(patch);
    }
});

const PatchesView = assign(() => create().call(PatchesView), {
    init() {
        window.addEventListener("keyup", this);
        this.element = document.body.appendChild(html("ul", { class: "patches" }));
    },

    // Keyboard commands for different keys.
    keyboardCommands: {
        // Create a new patch.
        n() {
            notify(this, "new");
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

    addPatch(patch) {
        this.element.appendChild(PatchView(patch).element);
    }
});

const PatchesController = assign(() => create().call(PatchesController), {
    init() {
        this.model = Patches();
        this.view = PatchesView();
        on(this.view, "new", () => { this.createPatch(); });
    },

    createPatch() {
        const patch = Patch();
        this.model.addPatch(patch);
        this.view.addPatch(patch);
    }
});

PatchesController();
