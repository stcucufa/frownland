import { notify } from "../lib/events.js";
import { assoc, create, nop } from "../lib/util.js";

const stop = ["stopped", function() {
    notify(this, "stop");
}];

const play = ["forward", nop];

const pause = ["paused", function() {
    notify(this, "pause");
}];

const States = {
    stopped: {
        play: ["forward", function() {
            notify(this, "start");
        }],
    },

    forward: {
        stop,
        pause,
    },

    paused: {
        stop,
        play,
    },
};

export const TransportBar = Object.assign(properties => create(properties).call(TransportBar), {
    init() {
        this.buttons = assoc(
            document.querySelectorAll("ul.transport-bar button"),
            button => {
                button.addEventListener("click", () => { this.setState(this.state[button.name]); });
                return [button.name, button];
            }
        );
        this.setState(stop);
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
