import { deselectText } from "./util.js";

// Make a box editable. Parametrized with the prototype (for drag events) and
// the property to edit (label for items, text for comments).
export const Editable = (Proto, property) => ({
    dragDidBegin() {
        this.willEdit = this.patcher.selection.has(this);
        Proto.dragDidBegin?.call(this);
    },

    dragDidProgress(dx, dy) {
        if (this.willEdit) {
            delete this.willEdit;
            deselectText();
        }
        Proto.dragDidProgress?.call(this, dx, dy);
    },

    dragDidEnd() {
        if (this.willEdit) {
            delete this.willEdit;
            this.patcher.willEdit(this);
        }
        Proto.dragDidEnd?.call(this);
    },

    deselected() {
        deselectText();
    },

    toggleEditing(editing) {
        if (editing) {
            try {
                this.input.contentEditable = "plaintext-only";
            } catch (_) {
                // Firefox (for instance) does not support "plaintext-only"
                this.input.contentEditable = true;
            }
            this.input.addEventListener("keydown", this);
            window.setTimeout(() => {
                this.input.focus();
                const selection = deselectText();
                const range = document.createRange();
                range.selectNodeContents(this.input);
                selection.addRange(range);
            });
        } else {
            this.input.contentEditable = false;
            this.input.removeEventListener("keydown", this);
            this[property] = this.input.textContent;
        }
    },

    handleEvent(event) {
        switch (event.key) {
            case "Escape":
                this.input.textContent = this[property];
            case "Enter":
                event.preventDefault();
                this.patcher.didEdit(this);
        }
    },
});
