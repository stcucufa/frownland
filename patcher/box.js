import { assign, create, nop, svg } from "../lib/util.js";
import { bringElementFrontward } from "./util.js";

// A draggable box that serves as a basis for all boxes (items, comments, ...)
export const Box = assign(properties => create(properties).call(Box), {
    x: 0,
    y: 0,

    // No default width or height, to be set by the different kinds of boxes.

    init() {
        this.rect = svg("rect", { width: this.width, height: this.height });
        this.element = this.initElement(svg("g", { class: "box" }, this.rect));
        this.rect.addEventListener("pointerdown", this.patcher.dragEventListener);
        this.updatePosition();
        this.patcher.elements.set(this.rect, this);
    },

    // Notify the patcher and stop listening to events.
    remove() {
        this.patcher.boxWillBeRemoved(this);
        this.rect.removeEventListener("pointerdown", this.patcher.ragEventListener);
        this.element.remove();
    },

    // Translate the element by (x, y).
    updatePosition() {
        this.element.setAttribute("transform", `translate(${this.x}, ${this.y})`);
    },

    // Toggle the selected state.
    toggleSelected(selected) {
        this.element.classList.toggle("selected", selected);
        if (selected) {
            this.selected?.();
            bringElementFrontward(this.element);
        } else {
            this.deselected?.();
        }
        return selected;
    },

    // Drag handling
    dragDidBegin() {
        this.willMove = true;
        this.patcher.select(this);
    },

    dragDidProgress(dx, dy) {
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
        this.patcher.boxMoveEnded();
    }
});
