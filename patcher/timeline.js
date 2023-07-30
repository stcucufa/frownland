import { assign, clockTime, create, removeChildren, svg } from "../lib/util.js";

export const Timeline = Object.assign((container) => create({ container }).call(Timeline), {
    init() {
        // Populate the timeline (ruler, occurrences overlay, play head) and
        // observe changes in size to update accordingly.
        new ResizeObserver(() => { this.sizeDidChange(); }).observe(this.container.parentElement);
        const g = this.container.appendChild(svg("g", {
            transform: `translate(${this.padding}, ${this.padding})`
        }));
        this.end = 0;
        this.ruler = Ruler();
        g.appendChild(this.ruler.element);
        this.occurrencesOverlay = OccurrencesOverlay();
        g.appendChild(this.occurrencesOverlay.element);
        const h = this.rulerHeight + this.occurrenceRadius;
        this.playHead = g.appendChild(svg("line", { class: "playhead", y1: 0, y2: h }));
        this.container.style.height = `${h + 2 * this.padding}px`;
    },

    // Constants for drawing the timeline and its subcomponents.
    padding: 8,
    rulerHeight: 24,
    minimumEnd: 10000,
    endIncrement: 2000,
    occurrenceRadius: 6,

    // On size change, re-render everything at the right scale.
    sizeDidChange() {
        const w = this.container.clientWidth;
        this.width = w - 2 * this.padding;
        this.ruler.sizeDidChange(this.width, this.end);
        this.occurrencesOverlay.sizeDidChange(this.width, this.end);
    },

    // On a deck update, move the play head and set the new end if necessary.
    deckDidUpdate(deck) {
        if (!(this.width > 0)) {
            return;
        }
        const end = Math.max(deck.now, this.minimumEnd);
        if (end > this.end) {
            while (end > this.end) {
                this.end += this.endIncrement;
            }
            this.ruler.endDidChange(this.end);
            this.occurrencesOverlay.sizeDidChange(this.width, this.end);
        }
        this.occurrencesOverlay.deckDidUpdate(deck, this.width, this.end);
        const x = deck.now / this.end * this.width;
        this.playHead.setAttribute("x1", x);
        this.playHead.setAttribute("x2", x);
    },

    // Add and remove occurrence from the overlay.
    occurrenceWasAdded(occurrence) {
        this.occurrencesOverlay.occurrenceWasAdded(occurrence, this.width, this.end);
    },

    occurrenceWasRemoved(occurrence) {
        this.occurrencesOverlay.occurrenceWasRemoved(occurrence);
    },
});

// Ruler, showing the timecount 
const Ruler = Object.assign(() => create().call(Ruler, {
    init() {
        this.element = svg("g", { class: "ruler" });
    },

    sizeDidChange(w, end) {
        removeChildren(this.element);
        if (w <= 0) {
            return;
        }

        console.log("Size did change", w, end);
        const h = Timeline.rulerHeight;
        this.element.appendChild(svg("line", { y1: h, x2: w, y2: h }));
        this.element.appendChild(svg("line", { y1: h, y2: h / 2 }));
        this.element.appendChild(svg("line", { x1: w, y1: h, x2: w, y2: h / 2 }));
        this.element.appendChild(svg("text", { y: h / 2 }, clockTime(0)));
        this.element.appendChild(svg("text", {
            x: w, y: h / 2, "text-anchor": "end"
        }, clockTime(end ?? 0)));
    },

    endDidChange(end) {
        const text = this.element.querySelector(`text[text-anchor="end"]`);
        if (text) {
            text.textContent = clockTime(end);
        }
    }
}));

const OccurrencesOverlay = Object.assign(() => create().call(OccurrencesOverlay, {
    init() {
        this.element = svg("g", {
            class: "occurrences-overlay",
            transform: `translate(0, ${Timeline.rulerHeight})`
        });
    },

    deckDidUpdate(deck, width, end) {
        if (!this.occurrences) {
            this.occurrences = new Map();
            for (const occurrence of deck.tape.occurrences) {
                this.occurrenceWasAdded(occurrence, width, end);
            }
        }
    },

    sizeDidChange(width, end) {
        removeChildren(this.element);
        if (width <= 0) {
            return;
        }

        if (this.occurrences) {
            if (end > 0) {
                for (const occurrence of this.occurrences.keys()) {
                    this.occurrenceWasAdded(occurrence, width, end);
                }
            } else {
                delete this.occurrences;
            }
        }
    },

    occurrenceWasAdded(occurrence, width, end) {
        if (!this.occurrences) {
            return;
        }
        this.occurrences.set(occurrence, this.element.appendChild(svg("circle", {
            class: "occurrence", cx: occurrence.t / end * width, r: Timeline.occurrenceRadius
        })));
    },

    removeOccurrence(occurrence) {
        if (!this.occurrences) {
            return;
        }
        this.occurrences.get(occurrence).remove();
        this.occurrences.delete(occurrence);
    },
}));
