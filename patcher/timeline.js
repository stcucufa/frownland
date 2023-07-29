import { clockTime, create, svg } from "../lib/util.js";
import { removeChildren } from "./util.js";

export const Timeline = Object.assign((element) => create({ element }).call(Timeline), {
    init() {
        new ResizeObserver(() => { this.draw(); }).observe(this.element.parentElement);
    },

    padding: 8,
    scaleHeight: 24,
    minimumEnd: 30000,
    endIncrement: 10000,
    occurrenceRadius: 6,

    draw() {
        const w = this.element.clientWidth;
        if (w === 0) {
            return;
        }
        this.end = this.minimumEnd;
        this.w = w - 2 * this.padding;
        removeChildren(this.element);
        delete this.occurrences;
        const g = this.element.appendChild(svg("g", { class: "scale" }));
        const h = this.scaleHeight;
        const y = this.padding + h;
        g.appendChild(svg("line", { x1: this.padding, y1: y, x2: w - this.padding, y2: y }));
        g.appendChild(svg("line", { x1: this.padding, y1: y, x2: this.padding, y2: y - h / 2 }));
        g.appendChild(svg("line", { x1: w - this.padding, y1: y, x2: w - this.padding, y2: y - h / 2 }));
        g.appendChild(svg("text", { x: this.padding, y: y - h / 2 }, clockTime(0)));
        this.endText = g.appendChild(svg("text", {
            x: w - this.padding, y: y - h / 2, "text-anchor": "end"
        }, clockTime(this.end)));
        this.playHead = this.element.appendChild(svg("line", {
            class: "playhead", x1: this.padding, y1: this.padding, x2: this.padding, y2: this.padding + h
        }));
        this.element.style.height = `${this.scaleHeight + 2 * this.padding}px`;
    },

    addedOccurrence(occurrence) {
        if (!this.occurrences) {
            return;
        }
        this.occurrences.set(occurrence, this.element.appendChild(svg("circle", {
            class: "occurrence",
            cx: this.padding + occurrence.t / this.end * this.w,
            cy: this.padding + this.scaleHeight - this.occurrenceRadius,
            r: this.occurrenceRadius
        })));
    },

    removeOccurrence(occurrence) {
        if (!this.occurrences) {
            return;
        }
        this.occurrences.get(occurrence).remove();
        this.occurrences.delete(occurrence);
    },

    updateDisplay(deck) {
        if (!this.playHead) {
            return;
        }
        if (deck.now > this.end - this.endIncrement) {
            while (deck.now > this.end - this.endIncrement) {
                this.end += this.endIncrement;
            }
            this.endText.textContent = clockTime(this.end);
        }
        if (!this.occurrences) {
            this.occurrences = new Map();
            for (const occurrence of this.tape.occurrences) {
                this.addedOccurrence(occurrence);
            }
        }
        const x = deck.now / this.end * this.w;
        this.playHead.setAttribute("x1", x);
        this.playHead.setAttribute("x2", x);
    }
});
