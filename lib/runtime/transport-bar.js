import { on } from "../events.js";
import { assoc, clockTime, create, html, svg } from "../util.js";

const proto = {
    init() {
        this.state = "init";
        Object.defineProperty(this, "element", {
            enumerable: true,
            value: this.createElement()
        });
    },

    remove() {
        this.stop();
        this.element.remove();
    },

    record() {
        this.setState("Record");
    },

    rewind() {
        this.setState("Rewind");
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

    stop() {
        this.setState("Stop");
    },

    setState(q) {
        if (States[this.state][q]) {
            const [state, effect] = States[this.state][q];
            this.state = state;
            effect(this.vm);
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
        this.display.textContent = clockTime(1000 * Math.floor(this.vm.clock.now / 1000));
    },

    createElement() {
        this.buttons = assoc(["Record", "Rewind", "Play", "Pause", "Ffwd", "Stop"], key => {
            const d = Buttons[key];
            const button = html("button", { type: "button" },
                svg("svg", { xmlns, viewBox: "-4 -4 108 108" },
                    typeof d === "string" ? svg("path", {
                        d, "stroke-width": 8, "stroke-linejoin": "round"
                    }) : d
                )
            );
            button.addEventListener("click", () => { this.setState(key); });
            return [key, button];
        });

        this.display = html("span", "xx:xx");
        this.update();
        on(this.vm.clock, "update", () => { this.updateDisplay(); });
        return html("div", { class: "transport-bar" }, ...this.buttons.values(), this.display);
    },
};

export const TransportBar = vm => create().call(proto, { vm });

const States = {
    init: {
        Record: ["recording", vm => { vm.start(); }]
    },

    recording: {
        Stop: ["stopped", vm => { vm.clock.stop(); }]
    }
}

const xmlns = "http://www.w3.org/2000/svg";

const Buttons = {
    Record: svg("circle", { cx: 50, cy: 50, r: 40 }),
    Rewind: "M100,20v60L50,50z M50,20v60L0,50z",
    Stop: "M20,20v60h60v-60z",
    Play: "M15.359,10v80L69.282,50z",
    Pause: "M20,20v60h20v-60z M60,20v60h20v-60z",
    Ffwd: "M0,20v60L50,50z M50,20v60L100,50z",
};
