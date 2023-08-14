import { assign, create, html } from "../lib/util.js";
import { notify, on } from "../lib/events.js";

// Manage a list of patches by their ID.
const Patches = assign(() => create().call(Patches), {
    localStorageKey: "patches:ids",

    init() {
        this.ids = [];
    },

    // Attempt to get saved IDs from local storage.
    loadPatchIDs() {
        try {
            const json = window.localStorage.getItem(this.localStorageKey);
            if (json) {
                this.ids = JSON.parse(json);
            }
        } catch (error) {
            notify(this, "error", { message: "Could not load from local storage", error });
        }
    },

    // Add the ID of the new patch to the list and save it to local storage.
    addPatchID(id) {
        this.ids.push(id);
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(this.ids));
        } catch (error) {
            notify(this, "error", { message: "Could not save to local storage", error });
        }
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

    addPatchID(id) {
        const openButton = html("button", { type: "button" }, "Open");
        openButton.addEventListener("click", () => { window.location = `../patcher/?id=${id}`; });
        this.element.appendChild(html("li", `Patch #${id} `, openButton));
    }
});

const PatchesController = assign(() => create().call(PatchesController), {
    init() {
        this.model = Patches();
        on(this.model, "error", ({ message, error }) => { console.error(message, error); });

        this.view = PatchesView();
        on(this.view, "new", () => { this.createPatch(); });

        this.model.loadPatchIDs();
        for (const id of this.model.ids) {
            this.view.addPatchID(id);
        }
    },

    createPatch() {
        const id = Math.random().toString(36).substr(2, 7);
        this.model.addPatchID(id);
        this.view.addPatchID(id);
    }
});

PatchesController();
