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
        this.foreignObject = svg("foreignObject", {
            y: Port.height,
            width: this.width,
            height: this.height - 2 * Port.height
        }, this.input);
        this.element = svg("g", { class: "box" },
            this.rect,
            this.foreignObject,
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

    // Update the size of the box based on the size of the content of the
    // foreign object.Do not go under the base size.
    updateSize(width, height) {
        const w = this.rect.width.baseVal.value;
        if ((width > w) || (width >= Box.width && width < w)) {
            this.width = width;
            this.rect.setAttribute("width", width);
            this.foreignObject.setAttribute("width", width);
            this.inlets[1].updateX(width - Port.width);
        }
        const h = Math.max(Box.height, height);
        this.height = h;
        this.rect.setAttribute("height", h);
        this.foreignObject.setAttribute("height", h - 2 * Port.height);
        this.outlets[0].updateY(h - Port.height);
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
        return selected;
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
            this.label = this.input.textContent;
        }
    },

    toggleUnknown(unknown) {
        this.element.classList.toggle("unknown", unknown);
    },

    handleEvent(event) {
        switch (event.key) {
            case "Escape":
                this.input.textContent = this.label;
            case "Enter":
                event.preventDefault();
                this.patcher.didEdit(this);
        }
    },

    // Drag handling
    dragDidBegin() {
        this.willEdit = this.patcher.selection.has(this);
        this.willMove = true;
        this.patcher.select(this);
    },

    dragDidProgress(dx, dy) {
        if (this.willEdit) {
            delete this.willEdit;
            deselectText();
        }
        if (this.willMove) {
            delete this.willMove;
            this.patcher.boxWillMove(this);
        }
        this.patcher.boxDidMove(this, dx, dy);
    },

    dragWasCancelled() {
        if (this.willMove) {
            delete this.willMove;
        } else {
            this.patcher.boxMoveWasCancelled();
        }
    },

    dragDidEnd() {
        if (this.willEdit) {
            delete this.willEdit;
            this.patcher.willEdit(this);
        }
    },
});
