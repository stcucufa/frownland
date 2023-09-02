import { on } from "../events.js";
import { assoc, clockTime, create, html, push, svg } from "../util.js";
import { dump } from "../timing/util.js";

// Transport bar controlling the deck for a given score (can also dump said score).
export const TransportBar = Object.assign(
    (score, params = {}) => create({ score, params }).call(TransportBar), {
    color: "#102040",

    init() {
        this.state = "init";
        Object.defineProperty(this, "element", {
            enumerable: true,
            value: this.createElement()
        });
        if (this.params.autoplay) {
            this.play();
        }
    },

    remove() {
        this.stop();
        this.element.remove();
    },

    // Create the transport bar element to be included into a page (the
    // stylesheet should be included as well).
    createElement() {
        this.buttons = assoc(["Stop", "Play", "Pause", "Ffwd"], key => {
            const d = Buttons[key];
            const button = html("button", { type: "button" },
                svg("svg", { xmlns, viewBox: "-4 -4 108 108" },
                    svg("path", {
                        d, fill: this.color, stroke: this.color,
                        "stroke-width": 8, "stroke-linejoin": "round"
                    })
                )
            );
            button.addEventListener("click", () => { this.setState(key); });
            return [key, button];
        });

        // Dump is a bit different from the other buttons.
        const dumpButton = html("button", { type: "button", name: "Dump" }, DumpButton(this.color));
        dumpButton.addEventListener("click", () => { console.log(dump(this.score.instance)); });

        this.display = html("span", "xx:xx");
        this.update();
        on(this.score.tape.deck, "updated", () => { this.updateDisplay(); });
        return html("div", { class: "transport-bar" }, ...this.buttons.values(), dumpButton, this.display);
    },

    stop() {
        this.setState("Stop");
    },

    play() {
        this.setState("Play");
    },

    pause() {
        this.setState("Pause");
    },

    fastForward() {
        this.setState("Ffwd");
    },

    setState(q) {
        if (States[this.state][q]) {
            const [state, effect] = States[this.state][q];
            this.state = state;
            effect(this.score.tape.deck, this.score);
            this.update();
        }
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

const Rates = [1, 2, 4, 8, 0.25, 0.5];

const Stop = ["stopped", deck => { deck.stop(); }];

const States = {
    init: {
        Play: ["playing", deck => { deck.start(); }],
    },

    playing: {
        Stop,
        Pause: ["paused", deck => { deck.pause(); }],
        Ffwd: ["playing", deck => {
            const index = Math.max(Rates.indexOf(deck.speed));
            deck.speed = Rates[index < 0 ? 0 : (index + 1) % Rates.length];
        }]
    },

    paused: {
        Stop,
        Play: ["playing", deck => { deck.resume(); }],
    },

    stopped: {
        Play: ["playing", (deck, score) => {
            score.reset();
            deck.speed = 1;
            deck.now = 0;
            deck.start();
        }],
    }
}

const Buttons = {
    Stop: "M20,20v60h60v-60z",
    Play: "M15.359,10v80L69.282,50z",
    Pause: "M20,20v60h20v-60z M60,20v60h20v-60z",
    Ffwd: "M0,20v60L50,50z M50,20v60L100,50z",
};

const xmlns = "http://www.w3.org/2000/svg";

const DumpButton = stroke => svg("svg", { xmlns, viewBox: "-224 -224 448 448" },
    svg("g", { stroke, fill: "none", "stroke-width": 48, "stroke-linejoin": "round" },
        svg("path", { d: "M-200,0 A 250 250 106.26 0 0 200,0 A 250 250 106.26 0 0 -200, 0 z" }),
        svg("circle", { r: 100 }),
        svg("circle", { r: 24 })
    )
);
