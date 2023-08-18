import { on } from "../lib/events.js";
import { assign, create, svg } from "../lib/util.js";
import { Tape } from "../lib/tape.js";
import { Deck } from "../lib/deck.js";
import { DragEventListener } from "./drag-event-listener.js";
import { Comment } from "./comment.js";
import { ItemBox } from "./item-box.js";
import { Patch } from "./patch.js";
import { Timeline } from "./timeline.js";
import { TransportBar } from "./transport-bar.js";
import { overlap } from "./util.js";

// Keyboard commands for different key. `this` is set to the patcher that calls
// the command.
const Commands = {
    // Create a comment box
    c() {
        const p = this.pointerPositionInCanvas();
        this.boxWasAdded(Comment({ patcher: this, x: p.x, y: Math.max(0, p.y - Comment.height) }), true);
    },

    // Dump the score (for debugging)
    d() {
        this.patch.dump();
    },

    // Add a new box.
    n() {
        const p = this.pointerPositionInCanvas();
        this.boxWasAdded(ItemBox({ patcher: this, x: p.x, y: Math.max(0, p.y - ItemBox.height) }), true);
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
        this.itemsGroup = this.canvas.querySelector(".items");
        this.targetsGroup = this.canvas.querySelector(".targets");
        this.elements = new Map();
        this.elements.set(this.canvas, this);
        this.dragEventListener = DragEventListener(this.elements);
        this.canvas.addEventListener("pointerdown", this.dragEventListener);
        this.canvas.addEventListener("pointermove", this);
        document.addEventListener("keyup", this);

        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        const patchKey = id ? `patch:${id}` : "patch";
        const patchMetadataKey = id ? `patch:meta:${id}` : "";

        this.mainElement = document.querySelector("div.main");

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
        on(this.patch, "score", ({ error }) => {
            if (error) {
                this.errorMessage(error.message);
            } else {
                // Save to local storage.
                try {
                    const patch = this.patch.serialize();
                    localStorage.setItem(patchKey, patch);
                    if (this.patchMetadata) {
                        this.patchMetadata.modified = Date.now();
                        localStorage.setItem(patchMetadataKey, JSON.stringify(this.patchMetadata));
                    }
                    console.info("Saved", JSON.parse(patch));
                } catch (error) {
                    console.error("Could not serialize: ", error);
                }
            }
        });
        on(this.patch, "bounding-rect", ({ rect }) => {
            this.canvas.style.minWidth = `${rect.width}px`;
            this.canvas.style.minHeight = `${rect.height}px`;
        });

        this.timeline = Timeline(document.querySelector("svg.timeline"));

        const tape = Tape();
        this.deck = Deck({ tape });
        on(this.deck, "update", () => {
            this.transportBar.updateDisplay();
            this.timeline.deckDidUpdate(this.deck);
        });
        on(tape, "add", ({ occurrence }) => { this.timeline.occurrenceWasAdded(occurrence); });
        on(tape, "remove", ({ occurrence }) => { this.timeline.occurrenceWasRemoved(occurrence); });
        on(tape, "erase", () => { this.timeline.tapeWasErased(); });

        this.transportBar = TransportBar(document.querySelector("ul.transport-bar"), this.deck);
        on(this.transportBar, "play", ({ tape }) => {
            this.locked = true;
            this.patch.updateScoreForTape(tape);
        });
        on(this.transportBar, "stop", () => {
            this.locked = false;
            this.patch.clearScore();
            this.errorMessage();
            for (const [element, box] of this.resizeObserverTargets) {
                if (element !== box.input) {
                    this.resizeObserver.unobserve(element);
                }
            }
        });

        try {
            const json = window.localStorage.getItem(patchKey);
            if (json) {
                const patch = JSON.parse(json);
                this.patch.deserialize(this, patch);
                if (patchMetadataKey) {
                    this.patchMetadata = JSON.parse(localStorage.getItem(patchMetadataKey));
                }
                console.info("Loaded", patch, this.patchMetadata);
            }
        } catch (error) {
            console.error("Could not load patch", error);
        }
    },

    // Show or clear the error message.
    errorMessage(error) {
        const p = document.querySelector("p.error");
        p.classList.toggle("hidden", !error);
        if (error) {
            p.textContent = error;
            this.transportBar.error();
        }
    },

    // Lock the patch when playing (no editing).
    get locked() {
        return this.mainElement.classList.contains("locked");
    },

    set locked(value) {
        this.mainElement.classList.toggle("locked", value);
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
                    !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
                    (!this.locked || LockedCommands.has(event.key))) {
                    Commands[event.key]?.call(this);
                }
                break;
        }
    },

    pointerPositionInCanvas() {
        const { x, y } = this.canvas.getBoundingClientRect();
        return { x: this.pointerX - x, y: this.pointerY - y };
    },

    observeElementInBox(element, box) {
        this.resizeObserverTargets.set(element, box);
        this.resizeObserver.observe(element);
    },

    boxWasAdded(box, interactive) {
        this.itemsGroup.appendChild(box.element);
        if (box.targets) {
            this.targetsGroup.appendChild(box.targets);
        }
        this.observeElementInBox(box.input, box);
        if (interactive) {
            this.select(box);
            this.willEdit(box);
        } else {
            this.patch.boxWasEdited(box);
        }
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

    // Select an item. If it is not a multiple selection, deselect everything
    // else.
    select(item, multiple = false) {
        if (!this.selection.has(item)) {
            if (!multiple) {
                this.deselect();
            }
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
            // Deselect anything else
            for (const selectedItem of this.selection) {
                if (selectedItem !== item) {
                    selectedItem.toggleSelected(false);
                    this.selection.delete(selectedItem);
                }
            }
        }
    },

    didEdit() {
        if (this.editItem) {
            this.editItem.toggleEditing(false);
            this.patch.boxWasEdited(this.editItem);
            delete this.editItem;
        }
    },

    boxWillMove(box) {
        if (!this.selection.has(box)) {
            this.select(box);
        }
        this.boxOrigins = new Map();
        for (const box of this.selection) {
            this.boxOrigins.set(box, { x: box.x, y: box.y });
        }
    },

    boxDidMove(_, dx, dy) {
        for (const item of this.selection) {
            const origin = this.boxOrigins.get(item);
            item.x = origin.x + dx;
            item.y = origin.y + dy;
            item.updatePosition();
        }
        this.patch.clearScore();
    },

    boxMoveWasCancelled() {
        for (const item of this.selection) {
            const origin = this.boxOrigins.get(item);
            item.x = origin.x;
            item.y = origin.y;
            item.updatePosition();
        }
    },

    boxMoveEnded() {
        for (const item of this.selection) {
            this.patch.updateBoundingRect(item);
        }
    },

    // Selection (multiple if dragging a rect, single if tapping an item).
    dragDidBegin(x0, y0) {
        if (this.locked) {
            return false;
        }
        const { x, y } = this.canvas.getBoundingClientRect();
        this.selectionRect = { tx: x, ty: y, x0: x0 - x, y0: y0 - y };
    },

    dragDidProgress(dx, dy, x, y) {
        this.selectionMoved = true;
        if (this.selectionRect) {
            if (!this.selectionRect.element) {
                this.selectionRect.element = this.canvas.appendChild(svg("rect", { class: "selection" }));
                this.didEdit();
            }
            this.selectionRect.x = Math.min(this.selectionRect.x0, x - this.selectionRect.tx);
            this.selectionRect.y = Math.min(this.selectionRect.y0, y - this.selectionRect.ty);
            this.selectionRect.width = Math.abs(dx);
            this.selectionRect.height = Math.abs(dy);
            for (const attribute of ["x", "y", "width", "height"]) {
                this.selectionRect.element.setAttribute(attribute, this.selectionRect[attribute]);
            }
            for (const box of this.patch.boxes.keys()) {
                if (box.toggleSelected(overlap(this.selectionRect, box))) {
                    this.selection.add(box);
                } else {
                    this.selection.delete(box);
                }
            }
        }
    },

    dragDidEnd() {
        if (this.selectionRect) {
            this.selectionRect.element?.remove();
            delete this.selectionRect;
        }
        if (!this.selectionMoved) {
            this.deselect();
        }
        delete this.selectionMoved;
    },
});

const patcher = Patcher(document.querySelector("svg.canvas"));
