import { add, assign, create, svg } from "../../lib/util.js";
import { Cord } from "./cord.js";

// Ports are inlets and outlets. Inlets and outlets from different boxes can
// be connected through cords (which are simple SVG lines).
export const Port = assign(properties => create(properties).call(Port), {
    x: 0,
    y: 0,
    width: 12,
    height: 3,
    r: 12,

    init() {
        this.patcher = this.box.patcher;
        this.rect = svg("rect", { width: this.width, height: this.height, x: this.x, y: this.y });
        this.element = svg("g", { class: "port" }, this.rect);
        this.target = svg("circle", {
            class: "target", cx: this.x + this.width / 2, cy: this.y + this.height / 2, r: this.r
        });
        this.patcher.elements.set(this.target, this);
        this.target.addEventListener("pointerdown", this.patcher.dragEventListener);
        this.cords = new Map();
    },

    // Remove all cords from/to this port when deleting it.
    remove() {
        this.target.removeEventListener("pointerdown", this.patcher.dragEventListener);
        this.target.remove();
        for (const cord of this.cords.values()) {
            cord.remove();
        }
    },

    // Connect a new cord from this (an outlet) to another port (an inlet).
    connect(port) {
        console.assert(this.isOutlet);
        const cord = Cord(this, 0, 0);
        cord.setInlet(port);
        this.cords.set(port, cord);
        port.cords.set(this, cord);
        return cord;
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

    updateY(y) {
        this.y = y;
        this.rect.setAttribute("y", y);
        this.target.setAttribute("cy", y + this.height / 2);
        this.updateCords();
    },

    // When the box moves, one end of every cord for this box must move as well.
    updateCords() {
        for (const cord of this.cords.values()) {
            cord.updatePortPosition(this);
        }
    },

    // Highlight when a current target for a coord. The highlight also shows
    // whether the target is valid or invalid.
    set isTargetForCord([possible, target]) {
        const isTarget = !!target;
        this.target.classList.toggle("potential-target", isTarget && possible);
        this.target.classList.toggle("invalid-target", isTarget && !possible);
    },

    // Enable or disable the port.
    get enabled() {
        return !this.element.classList.contains("disabled");
    },

    set enabled(value) {
        this.element.classList.toggle("disabled", !value);
        this.target.classList.toggle("disabled", !value);
        if (!value) {
            for (const cord of this.cords.values()) {
                cord.remove();
            }
        }
    },

    // Check whether a this is a possible target from another port. One must be
    // an inlet and the other an outlet, there can be only one cord per port
    // (this was already checked for this, but not for the potential target),
    // and the inlet must accept a connection from the outlet. Also prevent
    // cycles from being created.
    possibleTargetForCord(port) {
        if (port === this) {
            // Avoid showing a red target for the starting port.
            return;
        }
        if (port.possibleTargets.has(this)) {
            return port.possibleTargets.get(this);
        }
        // Ports must be of opposite polarity (inlet vs. outlet) and inlets
        // can have only one incoming cord (but outlets can have many outgoing
        // cords).
        if (port.isOutlet !== this.isOutlet && (this.isOutlet || this.cords.size === 0)) {
            const inlet = this.isOutlet ? port : this;
            const outlet = this.isOutlet ? this : port;
            if (this.patcher.inletAcceptsConnection(inlet, outlet)) {
                // Check for a cycle
                const visited = new Set([outlet.box]);
                const queue = [inlet];
                while (queue.length > 0) {
                    const p = queue.pop();
                    console.assert(!p.isOutlet);
                    if (visited.has(p.box)) {
                        return add(port.possibleTargets, this, [false, this]);
                    }
                    for (const o of p.box.outlets) {
                        for (const i of o.cords.keys()) {
                            queue.push(i);
                        }
                    }
                }
                return add(port.possibleTargets, this, [true, this]);
            }
        }
        return add(port.possibleTargets, this, [false, this]);
    },

    // Create a cord from this port. Prevent creating new incoming cords for
    // inlets that already have one.
    dragDidBegin(x0, y0) {
        if (!this.isOutlet && this.cords.size > 0) {
            return false;
        }
        this.canvasRect = this.patcher.canvas.getBoundingClientRect();
        this.cord = Cord(this, x0 - this.canvasRect.x, y0 - this.canvasRect.y);
        this.patcher.itemsGroup.appendChild(this.cord.element);
        this.patcher.deselect();
        this.possibleTargets = new Map();
    },

    // Update the cord and decide whether it can be connected to a target.
    dragDidProgress(_, __, x, y) {
        const element = document.elementsFromPoint(x, y).find(e => e.classList.contains("target"));
        const possibleTarget = this.patcher.elements.get(element)?.possibleTargetForCord?.(this);
        if (possibleTarget) {
            const [possible, target] = possibleTarget;
            if (this.dragTarget !== target) {
                if (this.dragTarget) {
                    this.dragTarget.isTargetForCord = [false];
                }
                this.dragTarget = target;
                this.dragTarget.isTargetForCord = possibleTarget;
            }
        } else {
            if (this.dragTarget) {
                this.dragTarget.isTargetForCord = [false];
                delete this.dragTarget;
            }
        }
        this.cord.updateEndpoint(x - this.canvasRect.x, y - this.canvasRect.y);
    },

    dragWasCancelled() {
        if (this.dragTarget) {
            this.dragTarget.isTargetForCord = [false];
            delete this.dragTarget;
        }
    },

    // Actually connect to the target if there is any and keep the coord;
    // otherwise, remove it.
    dragDidEnd() {
        if (this.dragTarget) {
            const [isValidTarget] = this.possibleTargets.get(this.dragTarget);
            if (isValidTarget) {
                this.cords.set(this.dragTarget, this.cord);
                this.dragTarget.cords.set(this, this.cord);
                if (this.dragTarget.isOutlet) {
                    this.cord.setOutlet(this.dragTarget);
                } else {
                    this.cord.setInlet(this.dragTarget);
                }
            } else {
                this.cord.element.remove();
            }
            this.dragTarget.isTargetForCord = [false];
            delete this.dragTarget;
        } else {
            this.cord.element.remove();
        }
        delete this.cord;
        delete this.canvasRect;
        delete this.possibleTargets;
    }
});

