import { assign, create, html, remove } from "../lib/util.js";
import { notify, on } from "../lib/events.js";
import { button } from "./util.js";

// Metadata is: created (date), modified (date), title (string), thumbnail (SVG)
const emptyMetadata = () => ({ created: Date.now() });

// Manage a list of patches referred to by their ID and their metadata.
const Patches = assign(() => create().call(Patches), {
    init() {
        this.ids = [];
        this.metadata = {};
    },

    // Add the ID of the new patch to the list and save it to local storage.
    addPatchID(id) {
        this.ids.push(id);
        this.metadata[id] = emptyMetadata();
        this.saveToLocalStorage(id);
        return this.metadata[id];
    },

    // Remove the ID of a patch from the list and save it to local storage.
    removePatchID(id) {
        if (remove(this.ids, id)) {
            this.saveToLocalStorage();
            delete this.metadata[id];
            this.deleteFromLocalStorage(id);
        }
    },

    // Keys for local storage: patch IDs and metadata for individula patches.
    localStorageKeys: {
        ids: "patches:ids",
        metadata: id => `patch:meta:${id}`
    },

    // Attempt to get saved IDs and metadata from local storage.
    loadFromLocalStorage() {
        try {
            const json = localStorage.getItem(this.localStorageKeys.ids);
            if (json) {
                this.ids = JSON.parse(json);
                for (const id of this.ids) {
                    const key = this.localStorageKeys.metadata(id);
                    const metadata = localStorage.getItem(key);
                    if (metadata) {
                        this.metadata[id] = JSON.parse(metadata);
                    } else {
                        console.warn(`No metadata for patch #${id}`);
                        this.metadata[id] = emptyMetadata();
                        localStorage.setItem(key, JSON.stringify(this.metadata[id]));
                    }
                }
            }
        } catch (error) {
            notify(this, "error", { message: "Could not load from local storage", error });
        }
    },

    // Save the current list of ids and metadata for the given ID (if any) to
    // local storage.
    saveToLocalStorage(id) {
        try {
            localStorage.setItem(this.localStorageKeys.ids, JSON.stringify(this.ids));
            if (id) {
                localStorage.setItem(this.localStorageKeys.metadata(id), JSON.stringify(this.metadata[id]));
            }
        } catch (error) {
            notify(this, "error", { message: "Could not save to local storage", error });
        }
    },

    // Delete metadata from local storage
    deleteFromLocalStorage(id) {
        const key = this.localStorageKeys.metadata(id);
        try {
            localStorage.removeItem(key);
        } catch (error) {
            notify(this, "error", { message: `Could not delete ${key} from local storage`, error });
        }
    },
});

// Show a list of patches.
const PatchesView = assign(() => create().call(PatchesView), {
    init() {
        this.ul = html("ul", { class: "patches" });
        this.element = document.body.appendChild(html("div",
            html("p", button("New", () => { notify(this, "new"); })),
            this.ul
        ));
    },

    // Add an item to the list of patches.
    addPatchID(id, metadata) {
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
        const title = html("span", metadata.title ?? `Untitled patch ${id}`);
        const date = html("span",
            { class: "date" },
            `(${new Date(metadata.modified ?? metadata.created).toLocaleString()})`
        );
        const item = this.ul.appendChild(html("li", title, " ", date, " ", openButton, " ", deleteButton));
    }
});

// Controller for the app coordinating the view and model.
const PatchesController = assign(() => create().call(PatchesController), {
    init() {
        this.model = Patches();
        on(this.model, "error", ({ message, error }) => { console.error(message, error); });

        this.view = PatchesView();
        on(this.view, "new", () => { this.createPatch(); });
        on(this.view, "remove", ({ id }) => { this.model.removePatchID(id); });

        this.model.loadFromLocalStorage();
        for (const id of this.model.ids) {
            this.view.addPatchID(id, this.model.metadata[id]);
        }
    },

    // Create metadata for a new patch.
    createPatch() {
        const id = Math.random().toString(36).substr(2, 7);
        const metadata = this.model.addPatchID(id);
        this.view.addPatchID(id, metadata);
    }
});

PatchesController();
