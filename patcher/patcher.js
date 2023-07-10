import { on } from "../lib/events.js";
import { assign, create } from "../lib/util.js";
import { DragEventListener } from "./drag-event-listener.js";
import { Box } from "./box.js";
import { Patch } from "./patch.js";
import { TransportBar } from "./transport-bar.js";

// Keyboard commands for different key. `this` is set to the patcher that calls
// the command.
const Commands = {
    // Dump the score (for debugging)
    d() {
        this.patch.dump();
    },

    // Add a new box.
    n() {
        const box = Box({
            patcher: this, x: this.pointerX, y: Math.max(0, this.pointerY - Box.height)
        });
        this.canvas.appendChild(box.element);
        this.boxWasAdded(box);
    },

    // Delete the selection (box or cord).
    Backspace() {
        for (const item of this.selection) {
            this.elements.delete(item);
            item.remove();
        }
        this.deselect();
    },

    // Play/pause/resume.
    " ": function() {
        this.transportBar.togglePlayback();
    },

    // Stop playback/unlock.
    "Escape": function() {
        this.transportBar.stop();
    }
};

// Commands that are still allowed while locked.
const LockedCommands = new Set(["d", " ", "Escape"]);

// A patcher is used to edit a patch in a canvas.
const Patcher = assign(canvas => create({ canvas }).call(Patcher), {
    init() {
        this.elements = new Map();
        this.elements.set(this.canvas, this);
        this.dragEventListener = DragEventListener(this.elements);
        this.canvas.addEventListener("pointerdown", this.dragEventListener);
        this.canvas.addEventListener("pointermove", this);
        document.addEventListener("keyup", this);

        // Track the pointer to know where to add new boxes.
        this.pointerX = 0;
        this.pointerY = 0;

        this.selection = new Set();
        this.resizeObserverTargets = new Map();
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                this.resizeObserverTargets.get(entry.target).updateSize(
                    entry.borderBoxSize[0]?.inlineSize,
                    entry.borderBoxSize[0]?.blockSize
                );
            }
        });

        this.patch = Patch();
        on(this.patch, "element", ({ element, box }) => {
            this.observeElementInBox(element, box);
        });
        on(this.patch, "score-error", ({ error }) => {
            console.error("Score error", error);
            this.transportBar.stop();
        });

        this.transportBar = TransportBar(document.querySelector("ul.transport-bar"));
        on(this.transportBar, "play", ({ tape }) => {
            this.locked = true;
            this.patch.updateScoreForTape(tape);
        });
        on(this.transportBar, "stop", () => {
            this.locked = false;
            this.patch.clearScore();
            for (const [element, box] of this.resizeObserverTargets) {
                if (element !== box.input) {
                    this.resizeObserver.unobserve(element);
                }
            }
        });
    },

    // Lock the patch when playing (no editing).
    get locked() {
        return this.canvas.classList.contains("locked");
    },

    set locked(value) {
        this.canvas.classList.toggle("locked", value);
        this.deselect();
    },

    // Keep track of the pointer position and listen to keyboard commands.
    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                // Keep track of the pointer to place new boxes.
                this.pointerX = event.clientX;
                this.pointerY = event.clientY;
                break;
            case "keyup":
                // Execute the command associated with the key (when not
                // otherwise editing). When locked, check whether the command
                // is still allowed (e.g. can pause/resume, but no new boxes).
                if (!this.editItem && !this.dragEventListener.target &&
                    (!this.locked || LockedCommands.has(event.key))) {
                    Commands[event.key]?.call(this);
                }
                break;
        }
    },

    observeElementInBox(element, box) {
        this.resizeObserverTargets.set(element, box);
        this.resizeObserver.observe(element);
    },

    boxWasAdded(box) {
        this.select(box);
        this.observeElementInBox(box.input, box);
        this.willEdit(box);
    },

    boxWillBeRemoved(box) {
        this.resizeObserverTargets.delete(box.input);
        this.resizeObserver.unobserve(box.input);
        this.patch.boxWillBeRemoved(box);
    },

    cordWasAdded(cord) {
        this.patch.cordWasAdded(cord);
    },

    cordWillBeRemoved(cord) {
        this.patch.cordWillBeRemoved(cord);
    },

    // Decide whether a connection between an inlet and an outlet is valid.
    inletAcceptsConnection(inlet, outlet) {
        return this.patch.inletAcceptsConnection(inlet, outlet);
    },

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
            }
            this.editItem = item;
            item.toggleEditing(true);
        }
    },

    didEdit() {
        if (this.editItem) {
            this.editItem.toggleEditing(false);
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
});

const patcher = Patcher(document.querySelector("svg.canvas"));
