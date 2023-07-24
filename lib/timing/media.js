import { assign, create, extend } from "../util.js";
import { failed } from "./util.js";
import { notify } from "../events.js";
import { Element } from "./element.js";

// Media is a kind of Element but with an intrinsic duration (video, audio).
export const Media = assign((element, parentElement, sibling) => create().call(
    Media, { element, parentElement, sibling }
), Element, {
    tag: "Media",

    init() {
        const duration = this.element.duration * 1000;
        if (!isNaN(duration)) {
            this.intrinsicDuration = duration;
        }
        this.element.addEventListener("loadedmetadata", this);
    },

    get duration() {
        return this.modifiers?.dur ?? this.intrinsicDuration;
    },

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
                    instance.parent?.item.childInstanceDidEnd(instance);
                } }));
                notify(this, "play", { instance });
            }).catch(error => {
                instance.end = instance.tape.deck.instantAtTime(performance.now());
                console.error(error);
                failed(instance, instance.end, error);
                notify(this, "play", { instance, error });
            });
        } });
    },

    handleEvent(event) {
        switch (event.type) {
            case "loadedmetadata":
                // Convert the element duration from seconds to milliseconds.
                this.intrinsicDuration = event.target.duration * 1000;
                notify(this, "dur");
                break;
        }
    }

});
