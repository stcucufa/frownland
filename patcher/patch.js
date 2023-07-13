import { Await, Delay, Effect, Element, Event, Instant, Par, Score, Seq, Try, dump } from "../lib/score.js";
import { assoc, create, html, I, K, normalizeWhitespace, parseTime, safe } from "../lib/util.js";
import { notify } from "../lib/events.js";
import { Box } from "./box.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.boxes = new Map();
        this.elementBoxes = new Map();
    },

    // Serialize to a string for local storage.
    serialize() {
        const boxesWithId = assoc([...this.boxes.keys()], (box, i) => [box, i]);
        const boxes = [];
        for (const [box, id] of boxesWithId.entries()) {
            boxes.push(box.serialize(id, boxesWithId));
        }
        return JSON.stringify(boxes);
    },

    // Deserialize from a parsed JSON object.
    deserialize(patcher, patch) {
        const boxes = patch.map(box => Box.deserialize(patcher, box));
        for (const box of boxes) {
            patcher.boxWasAdded(box, false);
        }
    },

    // Dump the score and tape (for debugging)
    dump() {
        if (this.score) {
            console.log(dump(this.score.instance));
            console.log(this.score.tape.show());
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
            try {
                this.score = Score({ tape });
                for (const [box, node] of this.boxes.entries()) {
                    if (!box.outlets[0].enabled) {
                        this.score.add(this.createItemFor(box, node));
                    }
                }
            } catch (error) {
                this.clearScore();
                notify(this, "score", { error });
            }
        }
    },

    clearScore() {
        for (const [box, input] of this.elementBoxes.entries()) {
            for (let child = box.foreignObject.firstChild; child;) {
                const sibling = child.nextSibling;
                child.remove();
                child = sibling;
            }
            box.foreignObject.appendChild(input);
        }
        this.elementBoxes.clear();
        delete this.score;
    },

    // Create an item from a box/node pair, getting the inputs from the inlets
    // as necessary.
    createItemFor(box, node, cord) {
        if (node.isElement) {
            this.elementBoxes.set(box, box.input);
            box.input.remove();
        }
        const inputs = box.inlets.flatMap(
            inlet => [...inlet.cords.entries()].map(([outlet, cord]) => [outlet.box, cord])
        ).map(([box, cord]) => {
            if (box) {
                const node = this.boxes.get(box);
                return this.createItemFor(box, node, cord);
            }
        });
        const item = node.create.call(this, inputs, box);
        if (cord?.isReference && node.isElement) {
            box.foreignObject.appendChild(item.element);
        }
        return item;
    },

    boxWasEdited(box) {
        delete this.score;
        const isNew = this.boxes.has(box);
        const node = parse(box.label);
        this.boxes.set(box, node);
        box.toggleUnknown(!!node.isUnknown);
        const n = node?.inlets ?? 0;
        box.inlets.forEach((port, i) => { port.enabled = i < n; });
        const m = node?.outlets ?? 1;
        box.outlets.forEach((port, i) => { port.enabled = i < m; });
    },

    boxWillBeRemoved(box) {
        delete this.score;
        this.boxes.delete(box);
    },

    cordWasAdded(cord) {
        const source = this.boxes.get(cord.outlet.box);
        cord.isReference = (source.isElement || source.isWindow) && this.boxes.get(cord.inlet.box).isEvent;
        delete this.score;
    },

    cordWillBeRemoved(cord) {
        delete this.score;
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
    const match = label.match(/^\s*([^\s\/]+)/);
    if (!match || !(match[1] in Parse)) {
        // Unknown item
        return {
            label,
            isUnknown: true,
            create() {
                throw window.Error(`Unknown item "${label}"`);
            }
        };
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
            create: inputs => Constructor(...inputs),
            acceptFrom: K(true),
            inlets: 2,
        }, params);
    }
};

const score = {
    inlets: 1,
    outlets: 0,
    create: ([item]) => item
};

// Parse different kinds of items and modifiers.
const Parse = {
    Await: evalNode(Await),
    Effect: evalNode(Effect),
    Instant: evalNode(Instant),

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

    Event: input => {
        const match = input.match(/^\s+(\w+)\s*$/);
        if (match) {
            const event = match[1];
            return {
                label: `Event ${event}`,
                inlets: 1,
                isEvent: true,
                acceptFrom: box => box.isElement || box.isWindow,
                create: ([target]) => Event(target.element, event)
            };
        }
    },

    Element: input => {
        let params = input;
        let match = params.match(/^\s+(\w+)/);
        if (!match) {
            return;
        }
        const tagName = match[1];
        params = params.substr(match[0].length);
        const attrs = {};
        while (match = params.match(/^\s+(\w+)\s*="([^"]+)"/)) {
            attrs[match[1]] = match[2];
            params = params.substr(match[0].length);
        }
        if (!/\S/.test(params)) {
            return {
                label: `Element ${tagName} ${normalizeWhitespace(input)}`,
                isElement: true,
                create: function(_, box) {
                    const element = html(tagName, attrs);
                    notify(this, "element", { element, box });
                    return Element(element, box.foreignObject);
                }
            };
        }
    },

    Button: input => {
        if (/^\s+/.test(input)) {
            return {
                label: `Button ${normalizeWhitespace(input)}`,
                isElement: true,
                create: (_, box) => Element(html("button", { type: "button" }, input), box.foreignObject)
            };
        }
    },

    Text: input => {
        if (/^\s+/.test(input)) {
            return {
                label: `Text ${normalizeWhitespace(input)}`,
                isElement: true,
                create: (_, box) => Element(document.createTextNode(input), box.foreignObject)
            };
        }
    },

    Window: input => {
        if (!/\S/.test(input)) {
            return {
                label: "Window",
                create: K({ element: window }),
                isWindow: true
            }
        }
    },

    Par: only(Par, { isContainer: true }),
    Seq: only(Seq, { isContainer: true }),
    Try: only(Try, { isTry: true }),

    Score: only({ tag: "Score" }, score),
    "dac~": only({ tag: "dac~" }, score),
    "ezdac~": only({ tag: "ezdac~" }, score),

    dur: input => {
        input = normalizeWhitespace(input);
        const d = safeParseTime(input);
        if (d > 0) {
            return {
                label: `dur ${input}`,
                create: ([item]) => item.dur?.(d),
                acceptFrom: node => !node.isTry,
                inlets: 1,
            }
        }
    },

    repeat: only(item => item.repeat(), {
        label: "repeat",
        create: ([item]) => item.repeat?.(),
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
                create: ([item]) => item.take?.(n),
                acceptFrom: node => node.isContainer,
                inlets: 1,
            }
        }
    }
};
