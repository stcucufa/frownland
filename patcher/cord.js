import { assign, create, svg } from "../lib/util.js";
import { bringElementFrontward } from "./util.js";

// A patch cord between an outlet and an inlet.
export const Cord = assign((port, x2, y2) => {
    const properties = {
        element: svg("g", { class: "cord" },
            svg("line", { x1: port.centerX, y1: port.centerY, x2, y2 }),
        )
    };
    if (port.isOutlet) {
        properties.outlet = port;
    } else {
        properties.inlet = port;
    }
    return create(properties).call(Cord);
}, {
    init() {
        this.patcher = (this.inlet ?? this.outlet).box.patcher;
    },

    get isReference() {
        return this.element.classList.contains("reference");
    },

    set isReference(value) {
        this.element.classList.toggle("reference", !!value);
    },

    // Set the outlet of the cord that was started from an inlet. Switch the
    // end points of the line so that it is always from outlet to inlet.
    setOutlet(port) {
        this.outlet = port;
        this.updateEndpoint(this.outlet.centerX, this.outlet.centerY, "x1", "y1");
        this.updateEndpoint(this.inlet.centerX, this.inlet.centerY);
        this.addTarget();
        this.patcher.cordWasAdded(this);
    },

    // Set the inlet of the cord that was started from an outlet.
    setInlet(port) {
        this.inlet = port;
        this.updateEndpoint(this.inlet.centerX, this.inlet.centerY);
        this.addTarget();
        this.patcher.cordWasAdded(this);
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
    remove() {
        this.patcher.cordWillBeRemoved(this);
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
                this.patcher.select(this);
        }
    }
});

