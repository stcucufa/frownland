import { notify } from "../events.js";
import { extend } from "../util.js";

const proto = {
    // Get the current logical time.
    get now() {
        return this.lastUpdateTime - this.startTime;
    },

    // True when the clock is running (has started and is not paused).
    get running() {
        return Object.hasOwn(this, "request");
    },

    // True when the clock is paused.
    get paused() {
        return Object.hasOwn(this, "pauseTime");
    },

    // Start the clock and generate updates on every animation frame.
    start() {
        console.assert(!this.boundUpdate);
        this.startTime = performance.now();
        this.lastUpdateTime = this.startTime;
        this.boundUpdate = this.update.bind(this);
        this.request = window.requestAnimationFrame(this.boundUpdate);
        notify(this, "start");
    },

    // Pause the clock.
    pause() {
        if (this.running && !this.paused) {
            window.cancelAnimationFrame(this.request);
            delete this.request;
            this.pauseTime = performance.now();
            notify(this, "pause");
        }
    },

    // Resume a paused clock.
    resume() {
        if (this.paused) {
            console.assert(this.boundUpdate);
            const delta = performance.now() - this.pauseTime;
            delete this.pauseTime;
            this.startTime += delta;
            this.lastUpdateTime += delta;
            this.request = window.requestAnimationFrame(this.boundUpdate);
            notify(this, "resume");
        }
    },

    // Stop the clock immediately.
    stop() {
        if (this.boundUpdate) {
            window.cancelAnimationFrame(this.request);
            delete this.request;
            delete this.boundUpdate;
            delete this.pauseTime;
            notify(this, "stop");
        }
    },

    // Execute the updates for a running clock.
    update() {
        this.request = window.requestAnimationFrame(this.boundUpdate);
        const from = this.now;
        this.lastUpdateTime = performance.now();
        const to = this.now;
        if (to > from) {
            notify(this, "update", { from, to });
        }
    },

    // Seek a stopped clock and execute updates synchronously.
    seek(to) {
        console.assert(!this.boundUpdate);
        const from = this.now;
        if (from === to) {
            return;
        }
        this.lastUpdateTime = performance.now();
        this.startTime = this.lastUpdateTime - to;
        notify(this, "update", { from, to });
    }
};

export const Clock = () => extend(proto, { startTime: 0, lastUpdateTime: 0 });
