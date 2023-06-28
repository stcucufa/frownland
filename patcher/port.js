import { assign, create, svg } from "../lib/util.js";
import { Cord } from "./cord.js";

// Ports are inlets and outlets. Inlets and outlets from different boxes can
// be connected through cords (which are simple SVG lines).
export const Port = assign(properties => create(properties).call(Port), {
    x: 0,
    y: 0,
    width: 12,
    height: 3,
    r: 10,

    init() {
        this.patcher = this.box.patcher;
        this.rect = svg("rect", { width: this.width, height: this.height, x: this.x, y: this.y });
        this.target = svg("circle", {
            cx: this.x + this.width / 2, cy: this.y + this.height / 2, r: this.r
        });
        this.element = svg("g", { class: "port" }, this.rect, this.target);
        this.target.addEventListener("pointerdown", this.patcher.dragEventListener);
        this.patcher.elements.set(this.target, this);
        this.cords = new Map();
    },

    // Remove all cords from/to this port when deleting it.
    remove() {
        this.target.removeEventListener("pointerdown", DragEventListener);
        for (const cord of this.cords.values()) {
            cord.remove();
        }
    },

    // Disconnect a cord from or to another port.
    disconnect(port, cord) {
        console.assert(this.cords.get(port) === cord);
        this.cords.delete(port);
    },

    get centerX() {
        return this.box.x + this.x + this.width / 2;
    },

    get centerY() {
        return this.box.y + this.y + this.height / 2;
    },

    updateX(x) {
        this.x = x;
        this.rect.setAttribute("x", x);
        this.target.setAttribute("cx", x + this.width / 2);
        this.updateCords();
    },

    // When the box moves, one end of every cord for this box must move as well.
    updateCords() {
        for (const cord of this.cords.values()) {
            cord.updatePortPosition(this);
        }
    },

    // Highlight when a current target for a coord.
    get isTargetForCord() {
        return this.element.classList.contains("target");
    },

    set isTargetForCord(value) {
        this.element.classList.toggle("target", value);
    },

    possibleTargetForCord(port) {
        if (port.box !== this.box && port.isOutlet !== this.isOutlet && !this.cords.has(port)) {
            return this;
        }
    },

    // Create a cord from this port.
    dragDidBegin(x, y) {
        this.cord = Cord(this, x, y);
        this.patcher.canvas.appendChild(this.cord.element);
        this.patcher.deselect();
    },

    // Update the cord and decide whether it can be connected to a target.
    dragDidProgress(_, __, x, y) {
        const element = document.elementsFromPoint(x, y)[1];
        const target = this.patcher.elements.get(element)?.possibleTargetForCord?.(this);
        if (target) {
            if (this.dragTarget !== target) {
                if (this.dragTarget) {
                    this.dragTarget.isTargetForCord = false;
                }
                this.dragTarget = target;
                this.dragTarget.isTargetForCord = true;
            }
        } else {
            if (this.dragTarget) {
                this.dragTarget.isTargetForCord = false;
                delete this.dragTarget;
            }
        }
        this.cord.updateEndpoint(x, y);
    },

    dragWasCancelled() {
        if (this.dragTarget) {
            this.dragTarget.isTargetForCord = false;
            delete this.dragTarget;
        }
    },

    // Actually connect to the target if there is any and keep the coord;
    // otherwise, remove it.
    dragDidEnd() {
        if (this.dragTarget) {
            this.dragTarget.isTargetForCord = false;
            this.cords.set(this.dragTarget, this.cord);
            this.dragTarget.cords.set(this, this.cord);
            if (this.dragTarget.isOutlet) {
                this.cord.setOutlet(this.dragTarget);
            } else {
                this.cord.setInlet(this.dragTarget);
            }
            delete this.dragTarget;
        } else {
            this.cord.element.remove();
        }
        delete this.cord;
        delete this.x0;
        delete this.y0;
    }
});

