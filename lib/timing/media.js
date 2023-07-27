import { assign, create, extend } from "../util.js";
import { failed } from "./util.js";
import { notify } from "../events.js";
import { Element } from "./element.js";

// Media is a kind of Element but with an intrinsic duration (video, audio).
// Note that durations from these elements are in seconds and are converted to
// milliseconds for the item.
export const Media = assign((element, parentElement, sibling) => create().call(
    Media, { element, parentElement, sibling }
), Element, {
    tag: "Media",

    // Get the existing intrinsic duration from the element or wait for it to
    // become available.
    init() {
        if (!isNaN(this.element.duration)) {
            this.intrinsicDuration = this.element.duration * 1000;
        } else {
            this.element.addEventListener("loadedmetadata", this);
        }
    },

    // Get the set duration or the intrinsic duration (if known).
    get duration() {
        return this.modifiers?.dur ?? this.intrinsicDuration;
    },

    // Instantiate, optionally waiting for the duration to be determined, and
    // removing the element when done, or if an error occurred (e.g. autoplay
    // is disabled).
    instantiate(instance, t, dur) {
        if (this.duration === 0) {
            return Object.assign(instance, { t, forward });
        }
        instance.begin = t;
        return extend(instance, { t, forward: () => {
            (this.parentElement ?? document.body).insertBefore(this.element, this.context);
            this.element.play().then(() => {
                console.assert(this.duration >= 0);
                instance.end = instance.tape.deck.instantAtTime(performance.now()) + this.duration;
                instance.value = this.valueForInstance.call(instance);
                instance.parent?.item.childInstanceEndWasResolved(instance);
                instance.tape.addOccurrence(extend(instance, { t: instance.end, forward: t => {
                    this.element.remove();
                    instance.tape.deck?.removeMediaElement(this.element);
                    instance.parent?.item.childInstanceDidEnd(instance);
                } }));
                instance.tape.deck?.addMediaElement(this.element);
                notify(this, "play", { instance });
            }).catch(error => {
                instance.end = instance.tape.deck.instantAtTime(performance.now());
                failed(instance, instance.end, error);
                instance.tape.addOccurrence(extend(instance, { t: instance.end, forward: t => {
                    this.element.remove();
                } }));
                notify(this, "play", { instance, error });
            });
        } });
    },

    handleEvent(event) {
        switch (event.type) {
            case "loadedmetadata":
                this.element.removeEventListener("loadedmetadata", this);
                this.intrinsicDuration = event.target.duration * 1000;
                notify(this, "dur");
                break;
        }
    }
});
