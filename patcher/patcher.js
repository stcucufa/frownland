import { assign, create, extend, html, svg } from "../lib/util.js";
import { Box } from "./box.js";
import { Patch } from "./patch.js";

// The main application (singleton object).
const Patcher = {
    init() {
        this.elements.set(this.canvas, this);
        this.canvas.addEventListener("pointerdown", this.dragEventListener);
        this.canvas.addEventListener("pointermove", this);
        document.addEventListener("keyup", this);
        this.resizeObserver = new ResizeObserver((entries) => {
            this.editItem.updateSize(entries[0]?.borderBoxSize[0]?.inlineSize);
        });
    },

    // Drag event listener for canvas, boxes and cords.
    dragEventListener: {
        handleEvent(event) {
            switch (event.type) {
                case "pointerdown":
                    document.addEventListener("pointermove", this);
                    document.addEventListener("pointerup", this);
                    document.addEventListener("pointercancel", this);
                    document.addEventListener("keyup", this);
                    event.preventDefault();
                    event.stopPropagation();
                    this.x0 = event.clientX;
                    this.y0 = event.clientY;
                    this.target = Patcher.elements.get(event.currentTarget);
                    this.target.dragDidBegin?.(this.x0, this.y0);
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
                case "keyup":
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
    },

    pointerX: 0,
    pointerY: 0,

    // Keyboard commands
    commands: {
        // Add a new box.
        n() {
            const box = Box({
                patcher: this, x: this.pointerX, y: Math.max(0, this.pointerY - Box.height)
            });
            this.canvas.appendChild(box.element);
            this.select(box);
            this.willEdit(box);
        },

        // Delete the selection (box or cord).
        Backspace() {
            for (const item of this.selection) {
                this.elements.delete(item);
                item.remove();
            }
            this.deselect();
        },
    },

    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                // Keep track of the pointer to place new boxes.
                this.pointerX = event.clientX;
                this.pointerY = event.clientY;
                break;
            case "keyup":
                // Execute the command associated with the key (when not
                // otherwise editing).
                if (!this.editItem && !this.dragEventListener.target) {
                    this.commands[event.key]?.call(this);
                }
                break;
        }
    },

    // The patch for this patcher
    patch: Patch(),

    boxWillBeRemoved(box) {
        this.patch.boxWillBeRemoved(box);
    },

    cordWasAdded(cord) {
        const outlet = cord.outlet;
        const inlet = cord.inlet;
        this.patch.cordWasAdded(
            outlet.box, outlet.box.outlets.indexOf(outlet),
            inlet.box, inlet.box.inlets.indexOf(inlet)
        );
    },

    cordWillBeRemoved(cord) {
        const outlet = cord.outlet;
        const inlet = cord.inlet;
        this.patch.cordWillBeRemoved(
            outlet.box, outlet.box.outlets.indexOf(outlet),
            inlet.box, inlet.box.inlets.indexOf(inlet)
        );
    },

    // The main canvas element
    canvas: document.querySelector("svg.canvas"),

    // Map between DOM elements and the objects that they represent on the canvas.
    elements: new Map(),

    selection: new Set(),

    // Select an item, deselecting everything else.
    select(item) {
        if (!this.selection.has(item)) {
            this.deselect();
            item.toggleSelected(true);
            this.selection.add(item);
        }
    },

    // Clear the selection.
    deselect() {
        for (const selectedItem of this.selection) {
            selectedItem.toggleSelected(false);
            if (selectedItem === this.editItem) {
                this.didEdit();
            }
        }
        this.selection.clear();
    },

    // Track item being edited
    willEdit(item) {
        if (this.editItem !== item) {
            if (this.editItem) {
                this.editItem.toggleEditing(false);
                this.resizeObserver.unobserve(this.editItem.input);
            }
            this.editItem = item;
            this.resizeObserver.observe(this.editItem.input);
            item.toggleEditing(true);
        }
    },

    didEdit() {
        if (this.editItem) {
            this.editItem.toggleEditing(false);
            this.resizeObserver.unobserve(this.editItem.input);
            this.patch.boxWasEdited(this.editItem);
            delete this.editItem;
        }
    },

    dragDidMove() {
        this.selectionMoved = true;
    },

    dragDidEnd() {
        if (!this.selectionMoved) {
            this.deselect();
        }
        delete this.selectionMoved;
    },
};

Patcher.init();
