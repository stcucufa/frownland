import { create, svg } from "../lib/util.js";
import { removeChildren } from "./util.js";

export const Timeline = Object.assign(element => create({ element }).call(Timeline), {
    init() {
        this.draw();
    },

    padding: 8,
    scaleHeight: 16,

    draw() {
        removeChildren(this.element);
        const g = this.element.appendChild(svg("g", { class: "scale" }));
        const w = this.element.clientWidth;
        const hh = this.scaleHeight / 2;
        const y = this.padding + hh;
        g.appendChild(svg("line", { x1: this.padding, y1: y, x2: w - this.padding, y2: y }));
        g.appendChild(svg("line", { x1: this.padding, y1: y - hh, x2: this.padding, y2: y + hh }));
        g.appendChild(svg("line", { x1: w - this.padding, y1: y - hh, x2: w - this.padding, y2: y + hh }));
        this.element.style.height = `${this.scaleHeight + 2 * this.padding}px`;
    },
});
