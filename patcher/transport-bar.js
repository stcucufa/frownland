import { notify, on } from "../lib/events.js";
import { assoc, create, nop } from "../lib/util.js";
import { Deck } from "../lib/deck.js";

const stop = ["stopped", function() {
    this.deck.stop();
    this.updateDisplay();
}];

const States = {
    stopped: {
        stop: ["stopped", function() {
            this.deck.now = 0;
            this.updateDisplay();
        }],
        play: ["forward", function() {
            this.deck.start();
            notify(this, "play");
        }],
    },

    forward: {
        stop,
        pause: ["paused", function() {
            this.deck.pause();
        }]
    },

    paused: {
        stop,
        play: ["forward", function() {
            this.deck.resume();
        }]
    },
};

export const TransportBar = Object.assign(element => create({ element }).call(TransportBar), {
    init() {
        this.buttons = assoc(
            this.element.querySelectorAll("button"),
            button => {
                button.addEventListener("click", () => { this.setState(this.state[button.name]); });
                return [button.name, button];
            }
        );
        this.display = this.element.querySelector("span.display");
        this.deck = Deck();
        on(this.deck, "update", () => {
            this.updateDisplay();
        });
        this.setState(stop);
    },

    updateDisplay() {
        this.display.textContent = mmss(this.deck.now);
    },

    setState(q) {
        if (!q) {
            return;
        }

        const [nextState, f] = q;
        this.state = States[nextState];
        for (const [name, button] of this.buttons.entries()) {
            button.disabled = !(name in this.state);
        }
        f.call(this);
    },

    States
});

const mmss = t => {
    const m = Math.floor(t / 60000);
    const s = (Math.floor(t / 1000)) % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};
