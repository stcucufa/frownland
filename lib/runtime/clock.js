import { notify } from "../events.js";
import { extend } from "../util.js";

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

    // Seek a stopped clock and execute updates synchronously.
    seek(to) {
        console.assert(!this.boundUpdate);
        to += this.startTime;
        if (to <= this.lastUpdateTime) {
            return;
        }
        const from = this.lastUpdateTime;
        this.lastUpdateTime = to;
        notify(this, "update", { from, to });
    },

    get now() {
        return this.lastUpdateTime - this.startTime;
    }
};

export const Clock = () => extend(proto, { startTime: 0, lastUpdateTime: 0 });
