import { assign, create, svg } from "../lib/util.js";

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
        const target = svg("circle", {
            cx: this.x + this.width / 2, cy: this.y + this.height / 2, r: this.r
        });
        this.element = svg("g", { class: "port" }, rect, target);
        target.addEventListener("pointerdown", DragEventListener);
        App.elements.set(target, this);
        this.cords = new Map();
    },

    get centerX() {
        return this.box.x + this.x + this.width / 2;
    },

    get centerY() {
        return this.box.y + this.y + this.height / 2;
    },

    // When the box moves, one end of every cord for this box must move as well.
    updateCords() {
        if (this.isOutlet) {
            for (const cord of this.cords.values()) {
                cord.setAttribute("x1", this.centerX);
                cord.setAttribute("y1", this.centerY);
            }
        } else {
            for (const cord of this.cords.values()) {
                cord.setAttribute("x2", this.centerX);
                cord.setAttribute("y2", this.centerY);
            }
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

    // Create a coord from this port.
    dragDidBegin(x, y) {
        this.cord = this.box.element.parentElement.appendChild(svg("line", {
            class: "cord",
            x1: this.centerX,
            y1: this.centerY,
            x2: x,
            y2: y,
        }));
        App.deselect();
    },

    // Update the cord and decide whether it can be connected to a target.
    dragDidProgress(_, __, x, y) {
        const element = document.elementsFromPoint(x, y)[1];
        const target = App.elements.get(element)?.possibleTargetForCord?.(this);
        if (target) {
            if (this.target !== target) {
                if (this.target) {
                    this.target.isTargetForCord = false;
                }
                this.target = target;
                this.target.isTargetForCord = true;
            }
        } else {
            if (this.target) {
                this.target.isTargetForCord = false;
                delete this.target;
            }
        }
        this.cord.setAttribute("x2", x);
        this.cord.setAttribute("y2", y);
    },

    dragWasCancelled() {
        if (this.target) {
            this.target.isTargetForCord = false;
            delete this.target;
        }
    },

    // Actually connect to the target if there is any and keep the coord;
    // otherwise, remove it.
    dragDidEnd() {
        if (this.target) {
            this.target.isTargetForCord = false;
            this.cords.set(this.target, this.cord);
            this.target.cords.set(this, this.cord);
            if (this.isOutlet) {
                this.cord.setAttribute("x2", this.target.centerX);
                this.cord.setAttribute("y2", this.target.centerY);
            } else {
                this.cord.setAttribute("x1", this.target.centerX);
                this.cord.setAttribute("y1", this.target.centerY);
                this.cord.setAttribute("x2", this.centerX);
                this.cord.setAttribute("y2", this.centerY);
            }
            delete this.target;
        } else {
            this.cord.remove();
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
        const rect = svg("rect", { width: this.width, height: this.height });
        this.element = svg("g", { class: "box" },
            rect,
            [...this.ports()].map(port => port.element)
        );
        rect.addEventListener("pointerdown", DragEventListener);
        this.updatePosition();
        App.elements.set(rect, this);
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
                    bringElementFrontward(cord);
                }
            }
            bringElementFrontward(this.element);
        }
    },

    // Drag handling
    dragDidBegin() {
        App.select(this);
        this.x0 = this.x;
        this.y0 = this.y;
    },

    dragDidProgress(dx, dy) {
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
    },
});

export const App = {
    init() {
        this.elements.set(this.canvas, this);
        this.canvas.addEventListener("pointerdown", DragEventListener);
        this.canvas.addEventListener("pointermove", this);
        document.addEventListener("keyup", this);
    },

    pointerX: 0,
    pointerY: 0,

    commands: {
        n() {
            const box = Box({ x: this.pointerX, y: Math.max(0, this.pointerY - Box.height) });
            this.canvas.appendChild(box.element);
            this.select(box);
        }
    },

    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                // Keep track of the pointer to place new boxes.
                this.pointerX = event.clientX;
                this.pointerY = event.clientY;
                break;
            case "keyup":
                this.commands[event.key]?.call(this);
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
            this.selection.delete(selectedItem);
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

App.init();
