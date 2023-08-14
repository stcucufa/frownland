import { assign, create, html, remove } from "../lib/util.js";
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
            const json = localStorage.getItem(this.localStorageKey);
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
        this.saveToLocalStorage();
    },

    // Remove the ID of a patch from the list and save it to local storage.
    removePatchID(id) {
        if (remove(this.ids, id)) {
            this.saveToLocalStorage();
        }
    },

    // Save the current list of ids to local storage, notifying the controller
    // in case of errors.
    saveToLocalStorage() {
        try {
            localStorage.setItem(this.localStorageKey, JSON.stringify(this.ids));
        } catch (error) {
            notify(this, "error", { message: "Could not save to local storage", error });
        }
    }
});

function button(label, f) {
    const button = html("button", { type: "button" }, label);
    button.addEventListener("click", f);
    return button;
}

const PatchesView = assign(() => create().call(PatchesView), {
    init() {
        this.ul = html("ul", { class: "patches" });
        this.element = document.body.appendChild(html("div",
            html("p", button("New", () => { notify(this, "new"); })),
            this.ul
        ));
    },

    addPatchID(id) {

        const openButton = button("open", () => { window.location = `../patcher/?id=${id}`; });
        const deleteButton = button("delete", () => {
            try {
                localStorage.removeItem(`patch:${id}`);
                item.remove();
                notify(this, "remove", { id });
            } catch (error) {
                console.error(`Could not remove item "patch:${id}"`, error);
            }
        });
        const item = this.ul.appendChild(html("li", `Patch #${id} `, openButton, " ", deleteButton));
    }
});

const PatchesController = assign(() => create().call(PatchesController), {
    init() {
        this.model = Patches();
        on(this.model, "error", ({ message, error }) => { console.error(message, error); });

        this.view = PatchesView();
        on(this.view, "new", () => { this.createPatch(); });
        on(this.view, "remove", ({ id }) => { this.model.removePatchID(id); });

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
