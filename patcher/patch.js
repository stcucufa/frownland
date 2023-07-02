import { Await, Delay, Effect, Event, Instant, Par, Score, Seq, Try } from "../lib/score.js";
import { create, normalizeWhitespace, parseTime, safe } from "../lib/util.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.score = Score();
        this.boxes = new Map();
    },

    boxWasEdited(box) {
        const isNew = this.boxes.has(box);
        const node = parse(box.label);
        this.boxes.set(box, node);
        box.toggleUnknown(!node);
        console.log(`Box was ${isNew ? "edited" : "added"}: ${node?.label ?? box.label}`);
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
    if (!match || !(match[1] in Parse)) {
        // Unknown item
        return;
    }
    return Parse[match[1]](label.substr(match[0].length));
}

// Parse time or not (for Delay or dur).
const safeParseTime = safe(parseTime);

// Parse a function (using eval?.()) or not (for Await, Effect, Instant).
const evalNode = Constructor => safe(input => {
    const f = eval?.(input);
    if (typeof f === "function") {
        return {
            label: `${Constructor.tag} ${normalizeWhitespace(input)}`,
            source: input,
            build: () => Constructor(f)
        };
    }
});

// Check that only the constructor is called, without extra parameters.
const only = Constructor => input => {
    if (!/\S/.test(input)) {
        return {
            label: Constructor.tag,
            build: Constructor
        }
    }
};

// Parse different kinds of items and modifiers.
const Parse = {
    Await: evalNode(Await),

    Delay: input => {
        const match = input.match(/^\/until\b/);
        if (match) {
            const normalized = normalizeWhitespace(input.substr(match[0].length));
            const t = safeParseTime(normalized);
            if (t > 0) {
                return {
                    label: `Delay/until ${normalized}`,
                    build: () => Delay.until(t)
                }
                return Delay.until(t);
            }
        } else {
            input = normalizeWhitespace(input);
            const d = safeParseTime(input);
            if (d > 0) {
                return {
                    label: `Delay ${input}`,
                    build: () => Delay(d)
                }
            }
        }
    },

    Effect: evalNode(Effect),

    Instant: evalNode(Instant),

    Par: only(Par),
    Seq: only(Seq),
    Try: only(Try),

    dur: input => {
        input = normalizeWhitespace(input);
        const d = safeParseTime(input);
        if (d > 0) {
            return {
                label: `dur ${input}`,
                build: item => item.dur?.(d)
            }
        }
    },

    repeat: only(() => ({
        label: "repeat",
        build: item => item.repeat?.()
    })),

    take: input => {
        const match = input.match(/^\s+\d+\s*$/);
        if (match) {
            const n = parseInt(match[0], 10);
            return {
                label: `take(${n})`,
                build: item => item.take?.()
            }
        }
    }
};
