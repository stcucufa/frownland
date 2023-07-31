import { assign, create, get, isNumber } from "./util.js";
import { notify } from "./events.js";

// The deck records to and plays a tape.
export const Deck = assign(properties => create(properties).call(Deck), {
    init() {
        this._now ??= 0;
        this.speed ??= 1;
        this.lastUpdateTime = 0;
        this.intervals = [];
        // This is a two-level map: keys are target objects, and values are
        // objects that have vent names as keys, and sets of instances as
        // values.
        this.eventTargets = new Map();
        // Keep track of media elements to pause, stop and resume them.
        this.mediaElements = new Set();
        if (this.tape) {
            this.tape.deck = this;
        }
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

    // Stop playback and reset playback speed.
    stop() {
        if (this.request) {
            cancelAnimationFrame(this.request);
            delete this.request;
            this.update(performance.now());
            delete this._startTime;
            delete this.pausedSpeed;
            this.speed = 1;
            for (const element of this.mediaElements) {
                element.pause();
            }
        }
    },

    // Pause playback. This is not just setting the speed to zero as it also
    // keeps track of the previous playback speed, which can be restored.
    pause() {
        if (this._speed !== 0) {
            const speed = this._speed;
            this.speed = 0;
            this.pausedSpeed = speed;
            for (const element of this.mediaElements) {
                element.pause();
            }
        }
    },

    // Resume playback at the previous playback speed.
    resume() {
        if (this.pausedSpeed !== 0) {
            console.assert(this._speed === 0);
            const speed = this.pausedSpeed;
            delete this.pausedSpeed;
            this.speed = speed;
            for (const element of this.mediaElements) {
                element.play();
            }
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
        notify(this, "updated", interval);
    },

    // Generic event handler: for all instances that have begun before the event
    // occurred in the targets maps that have the event name as key, pass the
    // event value to the instance.
    handleEvent(event) {
        const targets = this.eventTargets.get(event.currentTarget);
        const instances = targets[event.type];
        this.eventTargets.delete(event.target);
        event.target.removeEventListener(event.type, this);
        const t = this.instantAtTime(performance.now());
        for (const instance of instances) {
            if (t >= instance.begin) {
                instance.item.eventDidOccur(instance, event, t);
                instances.delete(instance);
            }
        }
    },

    // Add an event target for an instance, using this as the event handler.
    // If this is the first instance for the target/event pair, add an event
    // listener.
    addEventTarget(instance) {
        const item = instance.item;
        const targets = get(this.eventTargets, item.target, () => ({}));
        if (!Object.hasOwn(targets, item.event)) {
            targets[item.event] = new Set();
            item.target.addEventListener(item.event, this);
        }
        targets[item.event].add(instance);
    },

    // Remove the instance from the event handler, possibly removing the event
    // listener itself.
    removeEventTarget(instance) {
        const item = instance.item;
        const instances = this.eventTargets.get(item.target)[item.event];
        instances.delete(instance);
        if (instances.size === 0) {
            item.target.removeEventListener(item.event, this);
            delete this.eventTargets.get(item.target)[item.event];
        }
    },

    addMediaElement(element) {
        this.mediaElements.add(element);
    },

    removeMediaElement(element) {
        this.mediaElements.delete(element);
    }
});
