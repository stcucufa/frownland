import { assign, create, extend, html, svg } from "../lib/util.js";

// Drag event listener for canvas, boxes and cords.
const DragEventListener = {
    handleEvent(event) {
        switch (event.type) {
            case "pointerdown":
                document.addEventListener("pointermove", this);
                document.addEventListener("pointerup", this);
                document.addEventListener("pointercancel", this);
                event.preventDefault();
                event.stopPropagation();
                this.x0 = event.clientX;
                this.y0 = event.clientY;
                this.target = App.elements.get(event.currentTarget);
                this.target.dragDidBegin?.(this.x0, this.y0);
                break;
            case "pointermove":
                const x = event.clientX;
                const y = event.clientY;
                this.target.dragDidProgress?.(x - this.x0, y - this.y0, x, y);
                break;
            case "pointercancel":
                this.target.dragWasCancelled?.();
                // Fallthrough
            case "pointerup":
                this.target.dragDidEnd?.();
                delete this.x0;
                delete this.y0;
                delete this.target;
                document.removeEventListener("pointermove", this);
                document.removeEventListener("pointerup", this);
                document.removeEventListener("pointercancel", this);
        }
    }
};

// A patch cord between an outlet and an inlet.
const Cord = Object.assign((port, x2, y2) => {
    const properties = {
        element: App.canvas.appendChild(svg("g", { class: "cord" },
            svg("line", { x1: port.centerX, y1: port.centerY, x2, y2 }),
        ))
    };
    if (port.isOutlet) {
        properties.outlet = port;
    } else {
        properties.inlet = port;
    }
    return extend(Cord, properties);
}, {
    // Set the outlet of the cord that was started from an inlet. Switch the
    // end points of the line so that it is always from outlet to inlet.
    setOutlet(port) {
        this.outlet = port;
        this.updateEndpoint(this.outlet.centerX, this.outlet.centerY, "x1", "y1");
        this.updateEndpoint(this.inlet.centerX, this.inlet.centerY);
        this.addTarget();
    },

    // Set the inlet of the cord that was started from an outlet.
    setInlet(port) {
        this.inlet = port;
        this.updateEndpoint(this.inlet.centerX, this.inlet.centerY);
        this.addTarget();
    },

    // Update one end point of the lines.
    updateEndpoint(x, y, xAttribute = "x2", yAttribute = "y2") {
        for (const child of this.element.children) {
            child.setAttribute(xAttribute, x);
            child.setAttribute(yAttribute, y);
        }
    },

    // One of the ports of the cord has moved so update the cord accordingly.
    updatePortPosition(port) {
        const x = port.centerX;
        const y = port.centerY;
        if (port === this.outlet) {
            this.updateEndpoint(x, y, "x1", "y1");
        } else {
            this.updateEndpoint(x, y);
        }
    },

    // Toggle the selected state of the cord.
    toggleSelected(selected) {
        this.element.classList.toggle("selected", selected);
        if (selected) {
            bringElementFrontward(this.element);
        }
    },

    // Add a target line (transparent and thick) to help with selection.
    addTarget() {
        this.target = this.element.appendChild(svg("line", {
            opacity: 0, "stroke-width": 8,
            x1: this.outlet.centerX, y1: this.outlet.centerY,
            x2: this.inlet.centerX, y2: this.inlet.centerY,
        }));
        this.target.addEventListener("pointerdown", this);
    },

    // Remove a cord from both of its ports when deleting it. 
    delete() {
        this.outlet.disconnect(this.inlet, this);
        this.inlet.disconnect(this.outlet, this);
        this.target.removeEventListener("pointerdown", this);
        this.element.remove();
    },

    // Select the line on pointerdown.
    handleEvent(event) {
        switch (event.type) {
            case "pointerdown":
                event.preventDefault();
                event.stopPropagation();
                App.select(this);
        }
    }
});

// Ports are inlets and outlets. Inlets and outlets from different boxes can
// be connected through cords (which are simple SVG lines).
const Port = assign(properties => create(properties).call(Port), {
    x: 0,
    y: 0,
    width: 12,
    height: 3,
    r: 10,

    init() {
        const rect = svg("rect", { width: this.width, height: this.height, x: this.x, y: this.y });
        this.target = svg("circle", {
            cx: this.x + this.width / 2, cy: this.y + this.height / 2, r: this.r
        });
        this.element = svg("g", { class: "port" }, rect, this.target);
        this.target.addEventListener("pointerdown", DragEventListener);
        App.elements.set(this.target, this);
        this.cords = new Map();
    },

    // Delete all cords from/to this port when deleting it.
    delete() {
        this.target.removeEventListener("pointerdown", DragEventListener);
        for (const cord of this.cords.values()) {
            cord.delete();
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
        App.deselect();
    },

    // Update the cord and decide whether it can be connected to a target.
    dragDidProgress(_, __, x, y) {
        const element = document.elementsFromPoint(x, y)[1];
        const target = App.elements.get(element)?.possibleTargetForCord?.(this);
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

// A box represents an object. It has two inlets and one outlet by default.
const Box = assign(properties => create(properties).call(Box), {
    x: 0,
    y: 0,
    width: 104,
    height: 28,

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
        this.rect.addEventListener("pointerdown", DragEventListener);
        this.updatePosition();
        App.elements.set(this.rect, this);
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

    // Delete all ports when deleting the box.
    delete() {
        for (const port of this.ports()) {
            port.delete();
        }
        this.rect.removeEventListener("pointerdown", DragEventListener);
        this.element.remove();
    },

    // Move all cords from the ports when moving the box.
    updatePosition() {
        this.element.setAttribute("transform", `translate(${this.x}, ${this.y})`);
        for (const port of this.ports()) {
            port.updateCords();
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
            this.input.contentEditable = "plaintext-only";
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
        }
    },

    handleEvent(event) {
        switch (event.key) {
            case "Enter":
            case "Escape":
                App.didEdit(this);
        }
    },

    // Drag handling
    dragDidBegin() {
        this.willEdit = App.selection.has(this);
        App.select(this);
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
            App.willEdit(this);
        }
    },
});

// The main application (singleton object).
export const App = {
    init() {
        this.elements.set(this.canvas, this);
        this.canvas.addEventListener("pointerdown", DragEventListener);
        this.canvas.addEventListener("pointermove", this);
        document.addEventListener("keyup", this);
    },

    pointerX: 0,
    pointerY: 0,

    // Keyboard commands
    commands: {
        // Add a new box.
        n() {
            const box = Box({ x: this.pointerX, y: Math.max(0, this.pointerY - Box.height) });
            this.canvas.appendChild(box.element);
            this.select(box);
            this.willEdit(box);
        },

        // Delete the selection (box or cord).
        Backspace() {
            for (const item of this.selection) {
                this.elements.delete(item);
                item.delete();
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
                if (!this.editItem) {
                    this.commands[event.key]?.call(this);
                }
                break;
        }
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
            }
            this.editItem = item;
            item.toggleEditing(true);
        }
    },

    didEdit() {
        if (this.editItem) {
            this.editItem.toggleEditing(false);
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

function bringElementFrontward(element) {
    const parent = element.parentElement;
    element.remove();
    parent.appendChild(element);
}

function deselectText() {
    const selection = window.getSelection();
    selection.removeAllRanges();
    return selection;
}

App.init();
