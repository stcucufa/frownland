import { create } from "../lib/util.js";

// Drag event listener for canvas, boxes and cords.
export const DragEventListener = Object.assign(elements => create({ elements }).call(DragEventListener), {
    handleEvent(event) {
        switch (event.type) {
            case "pointerdown":
                const target = this.elements.get(event.currentTarget);
                if (target.dragDidBegin?.(event.clientX, event.clientY) === false) {
                    // Not returning from dragDidBegin does *not* cancel the
                    // drag, so explicitly check for false.
                    return;
                }
                document.addEventListener("pointermove", this);
                document.addEventListener("pointerup", this);
                document.addEventListener("pointercancel", this);
                document.addEventListener("keydown", this);
                event.preventDefault();
                event.stopPropagation();
                this.x0 = event.clientX;
                this.y0 = event.clientY;
                this.target = target;
                break;
            case "pointermove":
                const x = event.clientX;
                const y = event.clientY;
                this.target.dragDidProgress?.(x - this.x0, y - this.y0, x, y);
                break;
            case "pointercancel":
                this.dragWasCancelled();
                // Fallthrough
            case "pointerup":
                this.dragDidEnd();
                break;
            case "keydown":
                if (event.key === "Escape") {
                    this.dragWasCancelled();
                    this.dragDidEnd();
                }
        }
    },

    dragWasCancelled() {
        this.target.dragWasCancelled?.();
    },

    dragDidEnd() {
        this.target.dragDidEnd?.();
        delete this.x0;
        delete this.y0;
        delete this.target;
        document.removeEventListener("pointermove", this);
        document.removeEventListener("pointerup", this);
        document.removeEventListener("pointercancel", this);
        document.removeEventListener("keyup", this);
    }
});
