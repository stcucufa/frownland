import { Await, Delay, Effect, Event, Instant, Par, Score, Seq, Try } from "../lib/score.js";
import { create, K, normalizeWhitespace, parseTime, safe } from "../lib/util.js";

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
        const n = node?.inlets ?? 0;
        box.inlets.forEach((port, i) => { port.enable(i < n); });
        const m = node?.outlets ?? 1;
        box.outlets.forEach((port, i) => { port.enable(i < m); });
        console.log(`Box was ${isNew ? "edited" : "added"}: ${node?.label ?? box.label}`, node);
    },

    boxWillBeRemoved(box) {
        console.log(`Box will be removed: ${box.label}`);
        this.boxes.delete(box);
    },

    inletAcceptsConnection(inlet, outlet) {
        return this.boxes.get(inlet.box).acceptFrom?.(
            this.boxes.get(outlet.box),
            outlet.box.inlets.indexOf(inlet),
            outlet.box.outlets.indexOf(outlet)
        );
    }
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
const only = (Constructor, params = {}) => input => {
    if (!/\S/.test(input)) {
        return Object.assign({
            label: Constructor.tag,
            build: Constructor,
            acceptFrom: K(true),
            inlets: 2,
        }, params);
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

    Par: only(Par, { isContainer: true }),
    Seq: only(Seq, { isContainer: true }),
    Try: only(Try, { isTry: true }),

    dur: input => {
        input = normalizeWhitespace(input);
        const d = safeParseTime(input);
        if (d > 0) {
            return {
                label: `dur ${input}`,
                build: item => item.dur?.(d),
                acceptFrom: node => !node.isTry,
                inlets: 1,
            }
        }
    },

    repeat: only(item => item.repeat(), {
        label: "repeat",
        build: item => item.repeat?.(),
        isContainer: true,
        acceptFrom: node => !node.isTry,
        inlets: 1,
    }),

    take: input => {
        const match = input.match(/^\s+\d+\s*$/);
        if (match) {
            const n = parseInt(match[0], 10);
            return {
                label: `take(${n})`,
                build: item => item.take?.(),
                acceptFrom: node => node.isContainer,
                inlets: 1,
            }
        }
    }
};
