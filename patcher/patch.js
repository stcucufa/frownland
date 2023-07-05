import { Await, Delay, Effect, Event, Instant, Par, Score, Seq, Try, dump } from "../lib/score.js";
import { create, K, normalizeWhitespace, parseTime, safe } from "../lib/util.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.boxes = new Map();
    },

    // Dump the score (for debugging)
    dumpScore() {
        if (this.score) {
            console.log(dump(this.score.instance));
        } else {
            console.warn("No score");
        }
    },

    // Create a new score from the current items; or 
    updateScoreForTape(tape) {
        if (this.score) {
            // The score has not changed and neither should the tape.
            console.assert(this.score.tape === tape);
        } else {
            // Create a new score.
            tape.erase();
            this.score = Score({ tape });
            for (const [box, node] of this.boxes.entries()) {
                if (box.outlets[0].cords.size === 0) {
                    this.score.add(this.createItemFor(box, node));
                }
            }
        }
    },

    // Create an item from a box/node pair, getting the inputs from the inlets
    // as necessary.
    createItemFor(box, node) {
        const inputs = box.inlets.flatMap(
            inlet => [...inlet.cords.keys()].map(outlet => outlet.box)
        ).map(box => {
            if (box) {
                const node = this.boxes.get(box);
                return this.createItemFor(box, node);
            }
        });
        return node.create(...inputs);
    },

    boxWasEdited(box) {
        delete this.score;
        const isNew = this.boxes.has(box);
        const node = parse(box.label);
        this.boxes.set(box, node);
        box.toggleUnknown(!node);
        const n = node?.inlets ?? 0;
        box.inlets.forEach((port, i) => { port.enable(i < n); });
        const m = node?.outlets ?? 1;
        box.outlets.forEach((port, i) => { port.enable(i < m); });
    },

    boxWillBeRemoved(box) {
        delete this.score;
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
            create: () => Constructor(f)
        };
    }
});

// Check that only the constructor is called, without extra parameters.
const only = (Constructor, params = {}) => input => {
    if (!/\S/.test(input)) {
        return Object.assign({
            label: Constructor.tag,
            create: Constructor,
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
                    create: () => Delay.until(t)
                }
            }
        } else {
            input = normalizeWhitespace(input);
            const d = safeParseTime(input);
            if (d > 0) {
                return {
                    label: `Delay ${input}`,
                    create: () => Delay(d)
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
                create: item => item.dur?.(d),
                acceptFrom: node => !node.isTry,
                inlets: 1,
            }
        }
    },

    repeat: only(item => item.repeat(), {
        label: "repeat",
        create: item => item.repeat?.(),
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
                create: item => item.take?.(n),
                acceptFrom: node => node.isContainer,
                inlets: 1,
            }
        }
    }
};
