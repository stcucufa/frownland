import { assign, create, html, svg } from "../lib/util.js";
import { bringElementFrontward, deselectText } from "./util.js";
import { Port } from "./port.js";

// A box represents an object. It has two inlets and one outlet by default.
export const Box = assign(properties => create(properties).call(Box), {
    x: 0,
    y: 0,
    width: 52,
    height: 28,
    label: "",

    init() {
        this.inlets = [Port({ box: this }), Port({ box: this, x: this.width - Port.width })];
        this.outlets = [Port({ box: this, y: this.height - Port.height, isOutlet: true })];
        this.rect = svg("rect", { width: this.width, height: this.height });
        this.input = html("span", { class: "input", spellcheck: false });
        this.element = svg("g", { class: "box" },
            this.rect,
            svg("foreignObject", {
                y: Port.height,
                width: this.width,
                height: this.height - 2 * Port.height
            }, this.input),
            [...this.ports()].map(port => port.element)
        );
        this.rect.addEventListener("pointerdown", this.patcher.dragEventListener);
        this.updatePosition();
        this.patcher.elements.set(this.rect, this);
    },

    // Get all the ports (both inlets and outlets)
    *ports() {
        for (const inlet of this.inlets) {
            yield inlet;
        }
        for (const outlet of this.outlets) {
            yield outlet;
        }
    },

    // Remove all ports when deleting the box.
    remove() {
        this.patcher.boxWillBeRemoved(this);
        for (const port of this.ports()) {
            port.remove();
        }
        this.rect.removeEventListener("pointerdown", this.patcher.ragEventListener);
        this.element.remove();
    },

    // Move all cords from the ports when moving the box.
    updatePosition() {
        this.element.setAttribute("transform", `translate(${this.x}, ${this.y})`);
        for (const port of this.ports()) {
            port.updateCords();
        }
    },

    // Update the size of the box based on the size of the input control. Do
    // not go under the base width for boxes.
    updateSize(width) {
        const w = this.rect.width.baseVal.value;
        if ((width > w) || (width >= Box.width && width < w)) {
            this.rect.setAttribute("width", width);
            this.input.parentElement.setAttribute("width", width);
            this.inlets[1].updateX(width - Port.width);
        }
    },

    toggleSelected(selected) {
        this.element.classList.toggle("selected", selected);
        if (selected) {
            for (const port of this.ports()) {
                for (const cord of port.cords.values()) {
                    bringElementFrontward(cord.element);
                }
            }
            bringElementFrontward(this.element);
        } else {
            deselectText();
        }
    },

    toggleEditing(editing) {
        if (editing) {
            try {
                this.input.contentEditable = "plaintext-only";
            } catch (_) {
                // Firefox (for instance) does not support "plaintext-only"
                this.input.contentEditable = true;
            }
            this.input.addEventListener("keyup", this);
            window.setTimeout(() => {
                this.input.focus();
                const selection = deselectText();
                const range = document.createRange();
                range.selectNodeContents(this.input);
                selection.addRange(range);
            });
        } else {
            this.input.contentEditable = false;
            this.input.removeEventListener("keyup", this);
            this.label = this.input.textContent;
        }
    },

    handleEvent(event) {
        switch (event.key) {
            case "Escape":
                this.input.textContent = this.label;
            case "Enter":
                this.patcher.didEdit(this);
        }
    },

    // Drag handling
    dragDidBegin() {
        this.willEdit = this.patcher.selection.has(this);
        this.patcher.select(this);
        this.x0 = this.x;
        this.y0 = this.y;
    },

    dragDidProgress(dx, dy) {
        if (this.willEdit) {
            delete this.willEdit;
            deselectText();
        }
        this.x = this.x0 + dx;
        this.y = this.y0 + dy;
        this.updatePosition();
    },

    dragWasCancelled() {
        this.x = this.x0;
        this.y = this.y0;
        this.updatePosition();
    },

    dragDidEnd() {
        delete this.x0;
        delete this.y0;
        if (this.willEdit) {
            delete this.willEdit;
            this.patcher.willEdit(this);
        }
    },
});

