import { assign, create, html, svg } from "../lib/util.js";
import { Box } from "./box.js";
import { Editable } from "./editable.js";

export const Comment = assign(properties => create(properties).call(Comment), Box, Editable(Box, "text"), {
    width: 320,
    height: 22,
    text: "",

    initElement(element) {
        this.input = html("div", { class: "input", spellcheck: false }, this.text);
        this.foreignObject = element.appendChild(svg("foreignObject", {
            width: this.width,
            height: this.height
        }, this.input));
        element.classList.add("comment");
        return element;
    },

    serialize() {
        return {
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            text: this.input.textContent,
        };
    },

    deserialize(patcher, { x, y, width, height, text }) {
        return Comment({ patcher, x, y, width, height, text });
    },

    // Update the height of the box based on the size of the content of the
    // foreign object.
    updateSize(_, height) {
        const h = Math.max(Object.getPrototypeOf(this).height, height);
        this.height = h;
        this.rect.setAttribute("height", h);
        this.foreignObject.setAttribute("height", h);
    },
})
