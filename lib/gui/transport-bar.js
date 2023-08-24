import { on } from "../events.js";
import { assoc, clockTime, create, html, push, svg } from "../util.js";
import { dump } from "../timing/util.js";

// Transport bar controlling the deck for a given score (can also dump said score).
export const TransportBar = Object.assign(score => create({ score }).call(TransportBar), {
    color: "#102040",

    init() {
        this.state = "init";
    },

    // Create the transport bar element to be included into a page (the
    // stylesheet should be included as well).
    element() {
        const deck = this.score.tape.deck;

        this.buttons = assoc(["Stop", "Play", "Pause"], key => {
            const d = Buttons[key];
            const button = html("button", { type: "button", name: key },
                svg("svg", { xmlns, viewBox: "0 0 100 100" },
                    svg("path", {
                        d, fill: this.color, stroke: this.color,
                        "stroke-width": 8, "stroke-linejoin": "round"
                    })
                )
            );
            button.addEventListener("click", () => {
                if (States[this.state][key]) {
                    const [state, effect] = States[this.state][key];
                    this.state = state;
                    effect(deck);
                    this.update();
                }
            });
            return [key, button];
        });

        // Dump is a bit different from the other buttons.
        const dumpButton = html("button", { type: "button", name: "Dump" }, DumpButton(this.color));
        dumpButton.addEventListener("click", () => { console.log(dump(this.score.instance)); });

        this.display = html("span", "xx:xx");
        this.update();
        on(deck, "updated", () => { this.updateDisplay(); });
        return html("div", { class: "transport-bar" }, ...this.buttons.values(), dumpButton, this.display);
    },

    update() {
        this.updateDisplay();
        for (const key of Object.keys(Buttons)) {
            const button = this.buttons.get(key);
            button.disabled = !States[this.state][key];
        }
    },

    updateDisplay() {
        this.display.textContent = clockTime(1000 * Math.floor(this.score.tape.deck.now / 1000));
    }
});

const Stop = ["stopped", deck => { deck.stop(); }];

const States = {
    init: {
        Play: ["playing", deck => { deck.start(); }],
    },

    playing: {
        Stop,
        Pause: ["paused", deck => { deck.pause(); }],
    },

    paused: {
        Stop,
        Play: ["playing", deck => { deck.resume(); }],
    },

    stopped: {
    }
}

const Buttons = {
    Stop: "M20,20v60h60v-60z",
    Play: "M15.359,10v80L69.282,50z",
    Pause: "M20,20v60h20v-60z M60,20v60h20v-60z",
};

const xmlns = "http://www.w3.org/2000/svg";

const DumpButton = stroke => svg("svg", { xmlns, viewBox: "-224 -224 448 448" },
    svg("g", { stroke, fill: "none", "stroke-width": 48, "stroke-linejoin": "round" },
        svg("path", { d: "M-200,0 A 250 250 106.26 0 0 200,0 A 250 250 106.26 0 0 -200, 0 z" }),
        svg("circle", { r: 100 }),
        svg("circle", { r: 24 })
    )
);
