import { create, svg } from "../lib/util.js";

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

const DocumentEventListener = {
    x: 0,
    y: 0,

    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                this.x = event.clientX;
                this.y = event.clientY;
                break;
            case "keyup":
                if (event.key === "n") {
                    const box = Box({ x: this.x, y: this.y });
                    Box.elements.set(box.element, box);
                    canvas.appendChild(box.element).addEventListener("pointerdown", DragEventListener);
                }
        }
    }
};

document.addEventListener("pointermove", DocumentEventListener);
document.addEventListener("keyup", DocumentEventListener);

const canvas = document.querySelector("svg.canvas");

const Box = Object.assign(properties => create(properties).call(Box), {
    elements: new Map(),

    x: 0,
    y: 0,
    width: 104,
    height: 28,
    portWidth: 12,
    portHeight: 3,
    foregroundColor: "#102040",
    backgroundColor: "#f8f9f0",

    init() {
        const inlets = [
            svg("rect", { width: this.portWidth, height: this.portHeight }),
            svg("rect", { width: this.portWidth, height: this.portHeight, x: this.width - this.portWidth })
        ];
        const outlet = svg("rect", {
            width: this.portWidth, height: this.portHeight, y: this.height - this.portHeight
        });
        this.element = svg("g",
            svg("rect", {
                stroke: this.foregroundColor,
                fill: this.backgroundColor,
                width: this.width,
                height: this.height
            }),
            svg("g", { fill: this.foregroundColor }, ...inlets, outlet)
        );
        this.updatePosition();
    },

    updatePosition() {
        this.element.setAttribute("transform", `translate(${this.x}, ${this.y})`);
    }
});
