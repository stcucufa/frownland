import { on } from "../events.js";
import { assoc, clockTime, create, html, svg } from "../util.js";

const Pressed = Symbol();

const proto = {
    init() {
        this.state = this.vm.clock.running ? "recording" : "stopped";
        Object.defineProperty(this, "element", {
            enumerable: true,
            value: this.createElement()
        });
        on(this.vm.clock, "start", e => { this.syncState(e); });
        on(this.vm.clock, "stop", e => { this.syncState(e); });
        on(this.vm.clock, "update", () => { this.updateDisplay(); });
    },

    remove() {
        this.stop();
        this.element.remove();
    },

    createElement() {
        this.buttons = assoc(["Record", "Rewind", "Play", "Pause", "Ffwd", "Stop"], name => {
            const d = Buttons[name];
            const button = html("button", { type: "button", tabindex: 1, name },
                svg("svg", { xmlns, viewBox: "-4 -4 108 108" },
                    typeof d === "string" ? svg("path", {
                        d, "stroke-width": 8, "stroke-linejoin": "round"
                    }) : d
                )
            );
            button.addEventListener("click", () => { this.changeState(name); });
            return [name, button];
        });

        this.display = html("span", "xx:xx");
        this.update();
        return html("div", { class: "transport-bar" }, ...this.buttons.values(), this.display);
    },

    record() {
        this.changeState("Record");
    },

    stop() {
        this.changeState("Stop");
    },

    changeState(q) {
        if (Array.isArray(States[this.state][q])) {
            const [state, effect] = States[this.state][q];
            this.state = state;
            effect(this.vm);
            this.update();
        }
    },

    syncState(e) {
        switch (e.type) {
            case "start":
                this.changeState("Record");
                break;
            case "stop":
                this.changeState("Stop");
                break;
        }
    },

    update() {
        this.updateDisplay();
        for (const key of Object.keys(Buttons)) {
            const button = this.buttons.get(key);
            button.disabled = !Array.isArray(States[this.state][key]);
            button.classList.toggle("pressed", States[this.state][key] === Pressed);
        }
    },

    updateDisplay() {
        this.display.textContent = clockTime(1000 * Math.floor(this.vm.clock.now / 1000));
    },
};

export const TransportBar = vm => create().call(proto, { vm });

const States = {
    stopped: {
        Record: ["recording", vm => { vm.start(); }]
    },

    recording: {
        Record: Pressed,
        Stop: ["stopped", vm => { vm.clock.stop(); }],
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
