import { assign, create, html, svg } from "../../lib/util.js";
import { bringElementFrontward } from "./util.js";
import { Box } from "./box.js";
import { Editable } from "./editable.js";
import { Port } from "./port.js";

// A box represents an object. It has two inlets and one outlet by default.
export const ItemBox = assign(properties => create(properties).call(ItemBox), Box, Editable(Box, "label"), {
    width: 52,
    height: 28,
    label: "",

    initElement(element) {
        this.inlets = [Port({ box: this }), Port({ box: this, x: this.width - Port.width })];
        this.outlets = [Port({ box: this, y: this.height - Port.height, isOutlet: true })];
        this.input = html("span", { class: "input", spellcheck: false }, this.label);
        this.foreignObject = svg("foreignObject", {
            y: Port.height,
            width: this.width,
            height: this.height - 2 * Port.height
        }, this.input);
        element.appendChild(this.foreignObject);
        this.targets = svg("g");
        for (const port of this.ports()) {
            element.appendChild(port.element);
            this.targets.appendChild(port.target);
        }
        return element;
    },

    serialize(id, boxesWithId) {
        return {
            id,
            x: this.x,
            y: this.y,
            width: this.width,
            height: this.height,
            label: this.input.textContent,
            outlets: this.outlets.filter(outlet => outlet.enabled).map(
                outlet => [...outlet.cords.keys()].map(port => {
                    const boxId = boxesWithId.get(port.box);
                    const inletIndex = port.box.inlets.indexOf(port)
                    return [boxId, inletIndex];
                })
            ),
        };
    },

    deserialize(patcher, { x, y, width, height, label }) {
        return ItemBox({ patcher, x, y, width, height, label });
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

    selected() {
        bringElementFrontward(this.targets);
        for (const port of this.ports()) {
            for (const cord of port.cords.values()) {
                bringElementFrontward(cord.element);
            }
        }
    },

    // Remove all ports when deleting the box.
    remove() {
        Box.remove.call(this);
        for (const port of this.ports()) {
            port.remove();
        }
    },

    // Move all cords from the ports when moving the box.
    updatePosition() {
        Box.updatePosition.call(this);
        this.targets.setAttribute("transform", this.element.getAttribute("transform"));
        for (const port of this.ports()) {
            port.updateCords();
        }
    },

    // Update the size of the box based on the size of the content of the
    // foreign object.Do not go under the base size.
    updateSize(width, height) {
        const w = this.rect.width.baseVal.value;
        if ((width > w) || (width >= ItemBox.width && width < w)) {
            this.width = width;
            this.rect.setAttribute("width", width);
            this.foreignObject.setAttribute("width", width);
            this.inlets[1].updateX(width - Port.width);
        }
        const h = Math.max(ItemBox.height, height);
        this.height = h;
        this.rect.setAttribute("height", h);
        this.foreignObject.setAttribute("height", h - 2 * Port.height);
        this.outlets[0].updateY(h - Port.height);
    },

    toggleUnknown(unknown) {
        this.element.classList.toggle("unknown", unknown);
    },
});
