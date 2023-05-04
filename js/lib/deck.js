import { assign, create, isNumber, todo } from "./util.js";
import { notify } from "./events.js";

// The deck records to and plays a tape.
export const Deck = assign(properties => create(properties).call(Deck), {
    init() {
        this._now ??= 0;
        this.speed ??= 1;
        this.lastUpdateTime = 0;
        this.intervals = [];
    },

    // Get the current time.
    get now() {
        return this._now;
    },

    // Set the current time, playing back occurrences between the last update
    // time to the new current time.
    set now(value) {
        if (value !== this._now) {
            const from = this._now;
            this._now = value;
            if (isNumber(from)) {
                const interval = { from, to: this._now };
                if (this.request) {
                    this.lastUpdateTime = performance.now();
                    this.intervals.push(interval);
                } else {
                    this.updateInterval(interval);
                    this.lastUpdateTime = this._now;
                }
            }
        }
    },

    // True when playing.
    get playing() {
        return !!this.request;
    },

    // Get the current speed.
    get speed() {
        return this._speed;
    },

    // Set the current playback rate. 1 is the normal rate, values in ]0, 1[ are
    // slower, and above 1 are faster. Negative values go backward (this is not
    // fully supported yet). 0 suspends playback.
    set speed(value) {
        if (this.pausedSpeed) {
            if (value !== 0) {
                this.pausedSpeed = value;
            }
        } else if (value !== this._speed) {
            if (this.request) {
                this.intervals.push({
                    from: this.lastUpdateTime,
                    to: this.instantAtTime(performance.now())
                });
            }
            this._speed = value;
        }
    },

    // True when paused (but not when the speed was directly set to 0).
    get paused() {
        return !!this.pausedSpeed;
    },

    // Start playback.
    start() {
        if (!this.request) {
            const update = currentTime => {
                this.request = requestAnimationFrame(update);
                this.update(currentTime);
            };
            this.lastUpdateTime = performance.now();
            this.request = requestAnimationFrame(update);
        }
        return this;
    },

    // Stop playback.
    stop() {
        if (this.request) {
            cancelAnimationFrame(this.request);
            delete this.request;
            this.update(performance.now());
            delete this._startTime;
        }
    },

    // Pause playback. This is not just setting the speed to zero as it also
    // keeps track of the previous playback speed, which can be restored.
    pause() {
        if (this._speed !== 0) {
            const speed = this._speed;
            this.speed = 0;
            this.pausedSpeed = speed;
        }
    },

    // Resume playback at the previous playback speed.
    resume() {
        if (this.pausedSpeed !== 0) {
            console.assert(this._speed === 0);
            const speed = this.pausedSpeed;
            delete this.pausedSpeed;
            this.speed = speed;
        }
    },

    // Convert a physical time t to a logical instant time based on the state
    // of the deck.
    instantAtTime(t) {
        return this._now + (this.request ? (t - this.lastUpdateTime) * this._speed : 0);
    },

    // Get the current update interval and evaluate updates in that interval.
    update(updateTime) {
        for (const interval of this.intervals) {
            this.updateInterval(interval);
        }
        this.intervals.length = 0;
        const elapsedTime = updateTime - this.lastUpdateTime;
        if (elapsedTime <= 0) {
            return;
        }
        this.lastUpdateTime = updateTime;
        const from = this._now;
        this._now += elapsedTime * this._speed;
        this.updateInterval({ from, to: this._now });
    },

    // Evaluate updates in an interval, first notifying that an update is about
    // to happen (so that listeners can schedule occurrences if necessary),
    // then getting the occurrences to evaluate from the tape.
    updateInterval(interval) {
        const { from, to } = interval;
        if (from === to) {
            return;
        }
        interval.forward = from < to;
        notify(this, "update", interval);
        if (this.tape) {
            for (const occurrence of this.tape.occurrencesInInterval(interval)) {
                occurrence.forward(occurrence.t, interval);
            }
        }
    }
});
