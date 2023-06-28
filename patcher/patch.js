import { Score } from "../lib/score.js";
import { create } from "../lib/util.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.score = Score();
        this.boxes = new Set();
    },

    boxWasEdited(box) {
        console.log(`Box was ${this.boxes.has(box) ? "edited" : "added"}: ${box.label}`);
        this.boxes.add(box);
    },

    boxWillBeRemoved(box) {
        console.log(`Box will be removed: ${box.label}`);
        this.boxes.delete(box);
    },

    cordWasAdded(from, outletIndex, to, inletIndex) {
        console.log(`Cord was added: ${from.label}#${outletIndex} -> ${to.label}#${inletIndex}`);
    },

    cordWillBeRemoved(from, outletIndex, to, inletIndex) {
        console.log(`Cord will be removed: ${from.label}#${outletIndex} -> ${to.label}#${inletIndex}`);
    },
});
