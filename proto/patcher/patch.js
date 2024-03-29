import {
    Await, Delay, Effect, Element, Event, Instant, Media, Par, Ramp, Repeat, Score, Seq, Set, Try,
    gate
} from "../lib/timing.js";
import { dump } from "../lib/timing/util.js";
import {
    assoc, create, html, I, K, normalizeWhitespace, parseTime, removeChildren, safe
} from "../../lib/util.js";
import { notify } from "../../lib/events.js";
import { ItemBox } from "./item-box.js";
import { Comment } from "./comment.js";

export const Patch = Object.assign(properties => create(properties).call(Patch), {
    init() {
        this.boundingRect = { x: 0, y: 0, width: 0, height: 0 };
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
                        const items = this.createItemFor(new Map(), box, node);
                        for (const item of items) {
                            this.score.add(item);
                        }
                    }
                }
                for (const [box, [input, element]] of this.elementBoxes.entries()) {
                    input.remove();
                    if (element) {
                        try {
                            box.foreignObject.appendChild(element);
                        } catch (error) {
                            console.warn(error);
                        }
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
            removeChildren(box.foreignObject);
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
        if (item && cord?.isReference && node.isElement) {
            this.elementBoxes.get(box).push(item.element);
        }
        return item;
    },

    boxWasEdited(box) {
        if (box.label == null) {
            this.boxes.set(box, { isComment: true });
            this.updateBoundingRect(box);
            return;
        }
        delete this.score;
        const isNew = !this.boxes.has(box);
        const node = parse(box.label);
        box.textContent = node.label;
        this.boxes.set(box, node);
        this.updateBoundingRect(box);
        box.toggleUnknown(!!node.isUnknown);
        if (isNew || !node.isVariadic) {
            const n = node.inlets ?? 0;
            box.inlets.forEach((port, i) => { port.enabled = i < n; });
        } else if (node.isVariadic && !box.inlets[1].enabled && box.inlets[0].cords.size > 0) {
            box.inlets[1].enabled = true;
        }
        const m = node?.outlets ?? 1;
        box.outlets.forEach((port, i) => { port.enabled = i < m; });
    },

    boxWillBeRemoved(box) {
        delete this.score;
        this.boxes.delete(box);
    },

    updateBoundingRect(box, padding = 8) {
        const x1 = Math.min(this.boundingRect.x, box.x - padding);
        const y1 = Math.min(this.boundingRect.y, box.y - padding);
        const x2 = Math.max(this.boundingRect.x + this.boundingRect.width, box.x + box.width + padding);
        const y2 = Math.max(this.boundingRect.y + this.boundingRect.height, box.y + box.height + padding);

        // Shift everything when the canvas extends past the left/top edge of
        // its container.
        if (x1 < 0 || y1 < 0) {
            const tx = Math.min(x1, 0);
            const ty = Math.min(y1, 0);
            for (const box of this.boxes.keys()) {
                box.x -= tx;
                box.y -= ty;
                box.updatePosition();
            }
        }

        this.boundingRect.x = Math.max(x1, 0);
        this.boundingRect.width = x2 - x1;
        this.boundingRect.y = Math.max(y1, 0);
        this.boundingRect.height = y2 - y1;
        notify(this, "bounding-rect", { rect: this.boundingRect });
    },

    cordWasAdded(cord) {
        const source = this.boxes.get(cord.outlet.box);
        const target = this.boxes.get(cord.inlet.box);
        cord.isReference = (target.isFunction) || (source.isElement && (target.isEvent || target.isSet));
        if (target.isVariadic && cord.inlet === cord.inlet.box.inlets[0]) {
            cord.inlet.box.inlets[1].enabled = true;
        }
        delete this.score;
    },

    cordWillBeRemoved(cord) {
        const box = cord.inlet.box;
        if (this.boxes.get(box)?.isVariadic && cord.inlet === box.inlets[0] &&
            box.inlets[1].cords.size === 0) {
            box.inlets[1].enabled = false;
        }
        delete this.score;
    },

    inletAcceptsConnection(inlet, outlet) {
        return this.boxes.get(inlet.box).acceptFrom?.(
            this.boxes.get(outlet.box),
            inlet.box.inlets.indexOf(inlet),
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
        isVariadic: true,
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
            acceptFrom: K(true),
            inlets: 1,
            isFunction: true,
            isVariadic: true,
            create: extraVars => extraVars.reduce((item, v) => item.var(v), Constructor(f))
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
            label: `${Constructor.tag}/map`,
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

// Media nodes (Audio, Video).
const mediaNode = tagName => input => {
    const src = input.trim();
    if (/\S/.test(src)) {
        return {
            label: `${tagName.replace(/^./, c => c.toUpperCase())} ${src}`,
            isElement: true,
            create: (_, box) => {
                const element = html(tagName, { src });
                notify(this, "element", { element, box });
                return Media(element, box.foreignObject);
            }
        };
    }
};

// Create an element with a notification so that its size can be observed.
const createElement = (...args) => function(_, box) {
    const element = html(...args);
    notify(this, "element", { element, box });
    return Element(element, box.foreignObject);
};

const score = {
    inlets: 1,
    isVariadic: true,
    outlets: 0,
    create: inputs => inputs.filter(i => !!i)
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
                inlets: 2,
                isEvent: true,
                acceptFrom: (box, i) => (i === 0 && box.isElement) || (i === 1 && !box.isElement),
                create: ([target, child]) => Event(target.element, event, child)
            };
        }
    },

    Ramp: input => {
        if (!/\S/.test(input)) {
            return {
                label: Ramp.tag,
                inlets: 1,
                acceptFrom: box => !box.isElement,
                create: ([child]) => Ramp(child)
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
                acceptFrom: box => box.isElement,
                create: ([target]) => Set(target.element, name, value)
            };
        }
    },

    Element: input => {
        let match = input.match(/^\s+(\w+)/);
        if (!match) {
            return;
        }
        const tagName = match[1];
        let params = input.substr(match[0].length);
        const labelParams = normalizeWhitespace(params);
        const attrs = {};
        while (match = params.match(/^\s+(\w+)\s*="([^"]+)"/)) {
            attrs[match[1]] = match[2];
            params = params.substr(match[0].length);
        }
        if (!/\S/.test(params)) {
            return {
                label: `Element ${tagName} ${labelParams}`,
                isElement: true,
                create: createElement(tagName, attrs)
            };
        }
    },

    // Input element (default is text, but a short way to change the type is
    // Input/<type>, e.g. Input/number)
    Input: input => {
        let match = input.match(/^\/(\w+)\s*/);
        const modifier = match?.[1] ?? "";
        input = input.substr(match?.[0].length ?? 0);
        let params = input;
        const attrs = {};
        while (match = params.match(/^\s*(\w+)\s*="([^"]+)"(\s+|$)/)) {
            attrs[match[1]] = match[2];
            params = params.substr(match[0].length);
        }
        if (!/\S/.test(params)) {
            attrs.type = modifier || "text";
            return {
                label: `Input${modifier ? `/${modifier}` : ""} ${normalizeWhitespace(input)}`,
                isElement: true,
                create: createElement("input", attrs)
            };
        }
    },

    Image: input => {
        const src = input.trim();
        const attrs = {};
        if (src) {
            attrs.src = src;
        }
        return {
            label: `Image${src ? ` ${src}` : ""}`,
            isElement: true,
            create: createElement("img", attrs)
        }
    },

    Audio: mediaNode("audio"),
    Video: mediaNode("video"),

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
        const hasContent = /\S/.test(input);
        return {
            label: `Text${hasContent ? ` ${normalizeWhitespace(input)}` : ""}`,
            isElement: true,
            create: (_, box) => {
                const element = document.createTextNode(hasContent ? input : "");
                notify(this, "element", { element, box });
                return Element(element, box.foreignObject);
            }
        };
    },

    Document: input => {
        if (!/\S/.test(input)) {
            return {
                label: "Document",
                create: K({ element: document }),
                isElement: true,
            }
        }
    },

    Window: input => {
        if (!/\S/.test(input)) {
            return {
                label: "Window",
                create: K({ element: window }),
                isElement: true,
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

    Repeat: input => {
        if (/^\/until\s*$/.test(input)) {
            return {
                label: `${Repeat.tag}/until`,
                create: ([x, y]) => Repeat(x).until(y),
                acceptFrom: K(true),
                inlets: 2,
                isContainer: true
            };
        } else if (!/\S/.test(input)) {
            return {
                label: Repeat.tag,
                create: ([item]) => Repeat(item),
                acceptFrom: K(true),
                inlets: 1,
                isContainer: true
            };
        }
    },

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

    first: input => {
        const match = input.match(/^(?:\s+(\d+))?\s*$/);
        if (match) {
            const n = match[1] ? parseInt(match[1], 10) : 1;
            return {
                label: `first${match[1] ? ` ${n}` : ""}`,
                inlets: 2,
                isContainer: true,
                acceptFrom: K(true),
                create: items => Par(...items).take(n)
            }
        }
    },

    gate: only(gate, { label: "gate" }),
};

// Pick the right deserialization method for a serialized box (Item or Comment).
const deserializeBox = (patcher, serialized) => (
    typeof serialized.label === "string" ? ItemBox : Comment
).deserialize(patcher, serialized);
