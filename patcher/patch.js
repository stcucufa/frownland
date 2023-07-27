import {
    Await, Delay, Effect, Element, Event, Instant, Media, Par, Score, Seq, Set, Try
} from "../lib/timing.js";
import { dump } from "../lib/timing/util.js";
import { assoc, create, html, I, K, normalizeWhitespace, parseTime, safe } from "../lib/util.js";
import { notify } from "../lib/events.js";
import { ItemBox } from "./item-box.js";
import { Comment } from "./comment.js";

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
        const boxes = patch.map(serialized => [deserializeBox(patcher, serialized), serialized]);
        // First add all boxes
        for (const [box] of boxes) {
            patcher.boxWasAdded(box, false);
        }
        // Then connect them
        for (const [box, serialized] of boxes) {
            serialized.outlets?.forEach((destinations, outletIndex) => {
                const outlet = box.outlets[outletIndex];
                for (const [boxId, inletIndex] of destinations) {
                    const [targetBox] = boxes[boxId];
                    const inlet = targetBox.inlets[inletIndex];
                    const cord = outlet.connect(inlet);
                    patcher.itemsGroup.appendChild(cord.element);
                }
            });
        }
    },

    // Dump the score and tape (for debugging)
    dump() {
        if (this.score) {
            console.log(dump(this.score.instance, true));
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
                    if (!node.isComment && !box.outlets[0].enabled) {
                        this.score.add(this.createItemFor(new Map(), box, node));
                    }
                }
                for (const [box, [input, element]] of this.elementBoxes.entries()) {
                    input.remove();
                    if (element) {
                        box.foreignObject.appendChild(element);
                    }
                }
                notify(this, "score");
            } catch (error) {
                this.clearScore();
                notify(this, "score", { error });
            }
        }
    },

    clearScore() {
        delete this.score;
        for (const [box, [input]] of this.elementBoxes.entries()) {
            for (let child = box.foreignObject.firstChild; child;) {
                const sibling = child.nextSibling;
                child.remove();
                child = sibling;
            }
            box.foreignObject.appendChild(input);
        }
        this.elementBoxes.clear();
    },

    // Create an item from a box/node pair, getting the inputs from the inlets
    // as necessary.
    createItemFor(items, box, node, cord) {
        if (items.has(box)) {
            return items.get(box);
        }
        if (node.isElement) {
            this.elementBoxes.set(box, [box.input]);
        }
        const inputs = box.inlets.flatMap(
            inlet => [...inlet.cords.entries()].map(([outlet, cord]) => [outlet.box, cord])
        ).map(([box, cord]) => {
            if (box) {
                const node = this.boxes.get(box);
                const item = this.createItemFor(items, box, node, cord);
                items.set(box, item);
                return item;
            }
        });
        const item = node.create.call(this, inputs, box);
        if (cord?.isReference && node.isElement) {
            this.elementBoxes.get(box).push(item.element);
        }
        return item;
    },

    boxWasEdited(box) {
        if (box.label == null) {
            this.boxes.set(box, { isComment: true });
            return;
        }
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
        cord.isReference = (source.isElement || source.isWindow) &&
            (this.boxes.get(cord.inlet.box).isEvent || this.boxes.get(cord.inlet.box).isSet);
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

// Parse a box label and return a (possibly unknown) node.
function parse(label) {
    const match = label.match(/^\s*([^\s\/]+)/);
    return Parse[match?.[1]]?.(label.substr(match[0].length)) ?? {
        label,
        isUnknown: true,
        create() {
            throw window.Error(`Unknown item "${label}"`);
        }
    };
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

// Containers (par, seq) also have a possible /map modifier.
const container = Constructor => input => {
    if (/^\/map\s*$/.test(input)) {
        return {
            label: Constructor.map.tag,
            create: inputs => Constructor.map(inputs[0]),
            acceptFrom: K(true),
            inlets: 1,
            isContainer: true
        };
    } else if (!/\S/.test(input)) {
        return {
            label: Constructor.tag,
            create: inputs => Constructor(...inputs),
            acceptFrom: K(true),
            inlets: 2,
            isContainer: true
        };
    }
};

// Create an element with a notification so that its size can be observed.
const createElement = (...args) => function(_, box) {
    const element = html(...args);
    notify(this, "element", { element, box });
    return Element(element, box.foreignObject);
};

// Create a media element with a notification so that its size can be observed.
const createMedia = (...args) => function(_, box) {
    const element = html(...args);
    notify(this, "element", { element, box });
    return Media(element, box.foreignObject);
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

    Set: input => {
        const match = input.match(/^\s+(\w+)\s*/);
        if (match) {
            const name = match[1];
            let value;
            const rest = input.substr(match[0].length);
            if (/\S/.test(rest)) {
                value = rest.trim();
            }
            return {
                label: `Set ${name}`,
                inlets: 1,
                isSet: true,
                acceptFrom: box => box.isElement || box.isWindow,
                create: ([target]) => Set(target.element, name, value)
            }
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
                create: createElement(tagName, attrs)
            };
        }
    },

    Image: input => {
        const src = input.trim();
        if (/\S/.test(src)) {
            return {
                label: `Image ${src}`,
                isElement: true,
                create: createElement("img", { src })
            };
        }
    },

    Video: input => {
        const src = input.trim();
        if (/\S/.test(src)) {
            return {
                label: `Video ${src}`,
                isElement: true,
                create: createMedia("video", { src })
            }
        }
    },

    Button: input => {
        if (/^\s+/.test(input)) {
            return {
                label: `Button ${normalizeWhitespace(input)}`,
                isElement: true,
                create: createElement("button", { type: "button" }, input)
            };
        }
    },

    Text: input => {
        if (/^\s+/.test(input)) {
            return {
                label: `Text ${normalizeWhitespace(input)}`,
                isElement: true,
                create: (_, box) => {
                    const element = document.createTextNode(input);
                    notify(this, "element", { element, box });
                    return Element(element, box.foreignObject);
                }
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

    Par: container(Par),
    Seq: container(Seq),
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
                label: `take ${n}`,
                create: ([item]) => item.take?.(n),
                acceptFrom: node => node.isContainer,
                inlets: 1,
            }
        }
    },

    "#first": input => {
        const match = input.match(/^(?:\s+(\d+))?\s*$/);
        if (match) {
            const n = match[1] ? parseInt(match[1], 10) : 1;
            return {
                label: `#first ${n}`,
                inlets: 2,
                isContainer: true,
                acceptFrom: K(true),
                create: items => Par(...items).take(n)
            }
        }
    },
};

// Pick the right deserialization method for a serialized box (Item or Comment).
const deserializeBox = (patcher, serialized) => (
    typeof serialized.label === "string" ? ItemBox : Comment
).deserialize(patcher, serialized);
