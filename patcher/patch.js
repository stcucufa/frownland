import { Score, Par } from "../lib/score.js";
import { create } from "../lib/util.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.score = Score();
        this.boxes = new Map();
    },

    boxWasEdited(box) {
        const isNew = this.boxes.has(box);
        const item = parse(box.label);
        this.boxes.set(box, item);
        box.toggleUnknown(!item);
        console.log(`Box was ${isNew ? "edited" : "added"}: ${box.label} (${item?.show()})`);
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

function parse(label) {
    let m;
    if (m = label.match(/^\s*Par\s*$/)) {
        return Par();
    }
}
