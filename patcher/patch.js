import { Await, Delay, Effect, Event, Instant, Par, Score, Seq, Try } from "../lib/score.js";
import { create, parseTime } from "../lib/util.js";

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

const Items = {
    Await,

    Delay: input => {
        const match = input.match(/^\/until\s*/);
        if (match) {
            const t = safeParseTime(input.substr(match[0].length));
            if (t > 0) {
                return Delay.until(t);
            }
        } else {
            const d = safeParseTime(input);
            if (d > 0) {
                return Delay(d);
            }
        }
    },

    Effect,
    Event,

    Instant: input => safe(() => {
        const f = eval?.(input);
        if (typeof f === "function") {
            return Instant(f);
        }
    })(),

    Par,
    Seq,
    Try
};

function parse(label) {
    const match = label.match(/^\s*(\w+)\b/);
    if (!match || !(match[1] in Items)) {
        // Unknown item
        return;
    }
    return Items[match[1]](label.substr(match[0].length));
}

const safe = f => (...args) => {
    try {
        return f(...args);
    } catch (_) {
    }
}

const safeParseTime = safe(parseTime);
