import { on } from "../events.js";
import { clockTime, create, html, push, svg } from "../util.js";
import { dump } from "../timing/util.js";

const xmlns = "http://www.w3.org/2000/svg";

// Transport bar controlling the deck for a given score (can also dump said score).
export const TransportBar = Object.assign(score => create({ score }).call(TransportBar), {
    color: "#102040",

    element() {
        const deck = this.score.tape.deck;

        const buttons = ["Stop", "Play", "Pause"].map(key => {
            const { d, effect } = Buttons[key];
            const button = html("button", { type: "button", name: key },
                svg("svg", { xmlns, viewBox: "0 0 100 100" },
                    svg("path", {
                        d, fill: this.color, stroke: this.color,
                        "stroke-width": 8, "stroke-linejoin": "round"
                    })
                )
            );
            button.addEventListener("click", () => effect(deck));
            return button;
        });

        // Dump is a bit different.
        push(buttons, html("button", { type: "button", name: "Dump" }, DumpButton(this.color))).
            addEventListener("click", () => { console.log(dump(this.score.instance)); });

        const display = html("span", "--:--");
        on(deck, "updated", ({ source }) => {
            display.textContent = clockTime(1000 * Math.floor(source.now / 1000));
        });
        return html("ul", { class: "transport-bar" }, buttons, display);
    }
});

const Buttons = {
    Stop: {
        d: "M20,20v60h60v-60z",
        effect: deck => { deck.stop(); }
    },

    Play: {
        d: "M15.359,10v80L69.282,50z",
        effect: deck => { deck.paused ? deck.resume() : deck.start() }
    },

    Pause: {
        d: "M20,20v60h20v-60z M60,20v60h20v-60z",
        effect: deck => { deck.pause(); }
    },
};

const DumpButton = stroke => svg("svg", { xmlns, viewBox: "-204 -204 408 408" },
    svg("g", { stroke, fill: "none", "stroke-width": 32, "stroke-linejoin": "round" },
        svg("path", { d: "M-200,0 A 250 250 106.26 0 0 200,0 A 250 250 106.26 0 0 -200, 0 z" }),
        svg("circle", { r: 100 })
    )
);
