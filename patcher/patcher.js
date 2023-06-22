import { create, svg } from "../lib/util.js";

// The main canvas element
const canvas = document.querySelector("svg.canvas");

// Event listener for the main document to handle keyboard commands.
const DocumentEventListener = {
    x: 0,
    y: 0,

    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                // Keep track of the pointer to place new boxes.
                this.x = event.clientX;
                this.y = event.clientY;
                break;
            case "keyup":
                if (event.key === "n") {
                    // N for new box
                    const box = Box({ x: this.x, y: this.y });
                    canvas.appendChild(box.element).addEventListener("pointerdown", DragEventListener);
                }
        }
    }
};

document.addEventListener("pointermove", DocumentEventListener);
document.addEventListener("keyup", DocumentEventListener);

// Drag event listener for boxes.
const DragEventListener = {
    handleEvent(event) {
        switch (event.type) {
            case "pointerdown":
                document.addEventListener("pointermove", this);
                document.addEventListener("pointerup", this);
                document.addEventListener("pointercancel", this);
                event.preventDefault();
                this.box = Box.elements.get(event.currentTarget);
                this.x = this.box.x;
                this.y = this.box.y;
                this.x0 = event.clientX;
                this.y0 = event.clientY;
                this.box.bringToFront();
                break;
            case "pointermove":
                this.box.x = this.x + event.clientX - this.x0;
                this.box.y = this.y + event.clientY - this.y0;
                this.box.updatePosition();
                break;
            case "pointercancel":
                this.box.x = this.x;
                this.box.y = this.y;
                this.box.updatePosition();
                // Fallthrough
            case "pointerup":
                delete this.x0;
                delete this.y0;
                delete this.x;
                delete this.y;
                delete this.box;
                document.removeEventListener("pointermove", this);
                document.removeEventListener("pointerup", this);
                document.removeEventListener("pointercancel", this);
        }
    }
};

// Ports are inlets and outlets.
const Port = Object.assign(properties => create(properties).call(Port), {
    elements: new Map(),

    x: 0,
    y: 0,
    width: 12,
    height: 3,

    init() {
        this.element = svg("rect", { width: this.width, height: this.height, x: this.x, y: this.y });
        this.elements.set(this, this.element);
    }
});

// A box represents an object. It has two inlets and one outlet by default.
const Box = Object.assign(properties => create(properties).call(Box), {
    elements: new Map(),

    x: 0,
    y: 0,
    width: 104,
    height: 28,
    foregroundColor: "#102040",
    backgroundColor: "#f8f9f0",

    init() {
        const inlets = [Port(), Port({ x: this.width - Port.width })];
        const outlet = Port({ y: this.height - Port.height });
        this.element = svg("g",
            svg("rect", {
                stroke: this.foregroundColor,
                fill: this.backgroundColor,
                width: this.width,
                height: this.height
            }),
            svg("g", { fill: this.foregroundColor }, inlets.map(inlet => inlet.element), outlet.element)
        );
        this.updatePosition();
        this.elements.set(this.element, this);
    },

    bringToFront() {
        const parent = this.element.parentElement;
        this.element.remove();
        parent.appendChild(this.element);
    },

    updatePosition() {
        this.element.setAttribute("transform", `translate(${this.x}, ${this.y})`);
    }
});
