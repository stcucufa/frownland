import { notify, on } from "../../lib/events.js";
import { assoc, create, nop } from "../../lib/util.js";

const stop = ["stopped", function() {
    this.deck.stop();
    this.updateDisplay();
    notify(this, "stop");
}];

const States = {
    stopped: {
        stop: ["stopped", function() {
            this.deck.now = 0;
            this.updateDisplay();
            notify(this, "stop");
        }],
        play: ["forward", function() {
            this.deck.now = 0;
            this.deck.start();
            notify(this, "play", { tape: this.deck.tape });
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

    error: {
        stop
    }
};

// Transport bar controlling a Deck.
export const TransportBar = Object.assign((element, deck) => create({ element, deck }).call(TransportBar), {
    init() {
        this.buttons = assoc(
            this.element.querySelectorAll("button"),
            button => {
                button.addEventListener("click", () => { this.setState(this.state[button.name]); });
                return [button.name, button];
            }
        );
        this.display = this.element.querySelector("span.display");
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

    // Toggle between play and paused.
    togglePlayback() {
        this.setState(this.state.play ?? this.state.pause);
    },

    stop() {
        this.setState(this.state.stop);
    },

    // Special error state: stop the deck and only allow stopping again to
    // clear the state.
    error() {
        this.setState(["error", () => { this.deck.stop(); }]);
    },

    States
});

const pad = n => n.toString().padStart(2, "0");
const mmss = t => `${pad(Math.floor(t / 60000))}:${pad(Math.floor(t / 1000) % 60)}`
