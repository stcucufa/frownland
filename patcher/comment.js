import { assign, create, html, svg } from "../lib/util.js";
import { deselectText } from "./util.js";
import { Box } from "./box.js";

export const Comment = assign(properties => create(properties).call(Comment), Box, {
    width: 320,
    height: 22,
    text: "",

    initElement(element) {
        this.input = html("div", { class: "input", spellcheck: false }, this.label);
        this.foreignObject = element.appendChild(svg("foreignObject", {
            width: this.width,
            height: this.height
        }, this.input));
        element.classList.add("comment");
        return element;
    },

    // Update the size of the box based on the size of the content of the
    // foreign object.Do not go under the base size.
    updateSize(width, height) {
        const w = Math.max(Object.getPrototypeOf(this).width, width);
        this.width = w;
        this.rect.setAttribute("width", w);
        this.foreignObject.setAttribute("width", w);
        const h = Math.max(Object.getPrototypeOf(this).height, height);
        this.height = h;
        this.rect.setAttribute("height", h);
        this.foreignObject.setAttribute("height", h);
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
            this.text = this.input.textContent;
        }
    },

    handleEvent(event) {
        switch (event.key) {
            case "Escape":
                this.input.textContent = this.text;
            case "Enter":
                event.preventDefault();
                this.patcher.didEdit(this);
        }
    },
})
