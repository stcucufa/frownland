import { on } from "../events.js";
import { clockTime, create, html, svg } from "../util.js";

// Transport bar controlling a deck.
export const TransportBar = Object.assign(deck => create({ deck }).call(TransportBar), {
    color: "#102040",

    element() {
        const buttons = ["Stop", "Play", "Pause"].map(key => {
            const { d, effect } = Buttons[key];
            const button = html("button", { type: "button", name: key },
                svg("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 100 100", class: "icon" },
                    svg("path", {
                        d, fill: this.color, stroke: this.color,
                        "stroke-width": 8, "stroke-linejoin": "round"
                    })
                )
            );
            button.addEventListener("click", () => effect(this.deck));
            return button;
        });
        const display = html("span", "--:--");
        on(this.deck, "updated", ({ source }) => {
            display.textContent = clockTime(1000 * Math.floor(source.now / 1000));
        });
        return html("ul", { class: "transport-bar" }, buttons, display);
    }
});

const Buttons = {
    Stop: {
        d: "M20,20v60h60v-60z",
        effect: deck => deck.stop(),
    },

    Play: {
        d: "M15.359,10v80L69.282,50z",
        effect: deck => deck.paused ? deck.resume() : deck.start(),
    },

    Pause: {
        d: "M20,20v60h20v-60z M60,20v60h20v-60z",
        effect: deck => deck.pause(),
    },
};
