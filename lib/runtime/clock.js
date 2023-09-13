import { notify } from "../events.js";

const proto = {
    start() {
        console.assert(!this.boundUpdate);
        this.startTime = performance.now();
        this.lastUpdateTime = this.startTime;
        this.boundUpdate = this.update.bind(this);
        this.request = window.requestAnimationFrame(this.boundUpdate);
    },

    stop() {
        console.assert(this.boundUpdate);
        window.cancelAnimationFrame(this.request);
        delete this.request;
        delete this.boundUpdate;
    },

    update() {
        this.request = window.requestAnimationFrame(this.boundUpdate);
        const from = this.lastUpdateTime;
        this.lastUpdateTime = performance.now();
        if (this.lastUpdateTime > from) {
            notify(this, "update", { from, to: this.lastUpdateTime });
        }
    },

    get now() {
        return this.lastUpdateTime - this.startTime;
    }
};

export const Clock = () => Object.create(proto);
