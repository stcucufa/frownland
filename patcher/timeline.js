import { clockTime, create, svg } from "../lib/util.js";
import { removeChildren } from "./util.js";

export const Timeline = Object.assign(element => create({ element }).call(Timeline), {
    init() {
        new ResizeObserver(() => { this.draw(); }).observe(this.element.parentElement);
    },

    set score(value) {
        this.score = value;
        this.draw();
    },

    padding: 8,
    scaleHeight: 24,

    draw() {
        const w = this.element.clientWidth;
        if (!this.score || w === 0) {
            return;
        }
        removeChildren(this.element);
        const g = this.element.appendChild(svg("g", { class: "scale" }));
        const h = this.scaleHeight;
        const y = this.padding + h;
        g.appendChild(svg("line", { x1: this.padding, y1: y, x2: w - this.padding, y2: y }));
        g.appendChild(svg("line", { x1: this.padding, y1: y, x2: this.padding, y2: y - h / 2 }));
        g.appendChild(svg("line", { x1: w - this.padding, y1: y, x2: w - this.padding, y2: y - h / 2 }));
        g.appendChild(svg("text", { x: this.padding, y: y - h / 2 }, clockTime(0)));
        g.appendChild(svg("text", {
            x: w - this.padding, y: y - h / 2, "text-anchor": "end"
        }, clockTime(this.score.scaleEnd())));
        this.element.style.height = `${this.scaleHeight + 2 * this.padding}px`;
    },
});
