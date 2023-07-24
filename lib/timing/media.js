import { assign, create } from "../util.js";
import { notify } from "../events.js";
import { Element } from "./element.js";

// Media is a kind of Element but with an intrinsic duration (video, audio).
export const Media = assign((element, parentElement, sibling) => create().call(
    Media, { element, parentElement, sibling }
), Element, {
    tag: "Media",

    init() {
        this.element.addEventListener("loadedmetadata", this);
    },

    get duration() {
        return this.modifiers?.dur ?? this.intrinsicDuration;
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
