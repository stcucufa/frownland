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

// Parse a box label.
function parse(label) {
    const match = label.match(/^\s*(\w+)\b/);
    if (!match || !(match[1] in Items)) {
        // Unknown item
        return;
    }
    return Items[match[1]](label.substr(match[0].length));
}

// Wrap a function that throws in a try/catch and just ignore errors.
const safe = f => (...args) => {
    try {
        return f(...args);
    } catch (_) {
    }
}

// Parse time or not (for Delay or dur).
const safeParseTime = safe(parseTime);

// Parse a function (using eval?.()) or not (for Await, Effect, Instant).
const safeParseFunction = Constructor => safe(input => {
    const f = eval?.(input);
    if (typeof f === "function") {
        return Constructor(f);
    }
});

// Check that only the constructor is called, without extra parameters.
const only = Constructor => input => {
    if (!/\S/.test(input)) {
        return Constructor();
    }
};

// Parse different kinds of items.
const Items = {
    Await: safeParseFunction(Await),

    Delay: input => {
        const match = input.match(/^\/until\b/);
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

    Effect: safeParseFunction(Effect),

    Instant: safeParseFunction(Instant),

    Par: only(Par),
    Seq: only(Seq),
    Try: only(Try)
};
