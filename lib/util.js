// Add to a collection (Map or Set) and return the added item.
export function add(collection, ...args) {
    if (args.length === 1) {
        collection.add(args[0]);
        return args[0];
    }
    if (args.length === 2) {
        collection.set(args[0], args[1]);
        return args[1];
    }
}

// Add x to xs by the index where p becomes true, to keep an array sorted by
// some property. TODO use a better data structure for performance.
export function addBy(xs, x, p) {
    const i = xs.findIndex(p);
    if (i >= 0) {
        xs.splice(i, 0, x);
    } else {
        xs.push(x);
    }
    return x;
}

// We don’t just use assign because it does not handle getters/setters properly.
export function assign(object, ...properties) {
    for (let props of properties) {
        for (let key of Object.keys(props)) {
            Object.defineProperty(object, key, Object.getOwnPropertyDescriptor(props, key));
        }
    }
    return object;
}

// Combination of create and assign to quickly create new objects by extending
// existing ones with new properties.
export const extend = (object, ...properties) => assign(Object.create(object), ...properties);

// Return a create(properties) function for an object, allowing for default
// values for properties, and an optional init() method to be called on
// creation.
export function create(defaults = {}) {
    return function(...properties) {
        const o = extend(this, defaults, ...properties);
        if (typeof o.init === "function") {
            o.init();
        }
        return o;
    }
}

// Repeat xs infinitely.
export function* cycle(xs) {
    let i = 0;
    while (true) {
        yield(xs[i]);
        i = (i + 1) % xs.length;
    }
}

// Escape &, < and > for HTML-friendly text.
export const escapeMarkup = t => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Create a Map from a collection xs by applying a function f to every x.
// f is expected to return a [key, value] pair to be added to the Map.
export function assoc(xs, f = I) {
    const m = new Map();
    for (let i = 0, n = xs.length; i < n; ++i) {
        m.set(...f(xs[i], i));
    }
    return m;
}

// Clamp x between min and max.
export const clamp = (x, min, max) => Math.min(Math.max(min, x), max);

// Create a DOM element in the given namespace. Use html or svg for known
// namespaces. Attributes can be given as an optional object, followed by
// children, handling arrays and strings as text nodes.
export function element(ns, tagname, ...children) {
    const appendChild = (element, child) => {
        if (typeof child === "string") {
            element.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
            element.appendChild(child);
        } else if (Array.isArray(child)) {
            for (let ch of child) {
                appendChild(element, ch);
            }
        }
    };

    const element = document.createElementNS(ns, tagname);
    if (isObject(children[0]) && !Array.isArray(children[0]) && !(children[0] instanceof Element)) {
        for (let [attribute, value] of Object.entries(children[0])) {
            element.setAttribute(attribute, value);
        }
    }
    appendChild(element, [...children]);
    return element;
}

export const html = (...args) => element("http://www.w3.org/1999/xhtml", ...args);
export const svg = (...args) => element("http://www.w3.org/2000/svg", ...args);

// Get an element from a Map, or create a default value from f if absent.
export function get(map, key, f) {
    if (!map.has(key)) {
        const v = f();
        map.set(key, v);
        return v;
    }
    return map.get(key);
}

// Reverse the first two arguments of f (and discard any other).
export const flip = f => (x, y) => f(y, x);

// Fold using the first x as the initial accumulator value.
export function fold1(xs, f, that) {
    const n = xs.length;
    if (n === 0) {
        return;
    }

    let z = xs[0];
    for (let i = 1; i < n; ++i) {
        z = f.call(that, z, xs[i]);
    }
    return z;
}

// Identity combinator.
export const I = x => x;

// Promise of a loaded image element given its URL.
export const imagePromise = url => new Promise((resolve, reject) => {
    const image = new Image();
    image.src = url;
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error(`Could not load image with URL "${url}"`));
});

// Distinguish async functions from sync functions.
const AsyncFunction = (async () => {}).constructor;
export const isAsync = f => f instanceof AsyncFunction;

// Test for empty strings, arrays, Sets, Maps, and objects.
export const isEmpty = x => typeof x === "string" || Array.isArray(x) ? x.length === 0 :
    x instanceof Set || x instanceof Map ? x.keys().next().done :
    isObject(x) ? Object.keys(x).length === 0 : false;

// Test if an object is iterable.
export const isIterable = x => typeof x?.[Symbol.iterator] === "function";

// Test for a number (may be infinite, but not NaN).
export const isNumber = x => typeof x === "number" && !isNaN(x);

// Test for a non-null object.
export const isObject = x => typeof x === "object" && x !== null;

// Constant combinator.
export const K = x => y => x;

// See floored division in
// https://en.wikipedia.org/wiki/Modulo_operation#Variants_of_the_definition.
export const mod = (a, n) => a - n * Math.floor(a / n);

// Do nothing.
export const nop = () => {};

// Parse time values into a number of milliseconds.
// Units are week (w), day (d), hour (h), minute (m), second (s) and millisecond
// (ms). Unitless values default to ms (e.g., "500" is 500ms), and strings can
// contain several units ("1m 30s" is 90000ms).
const Units = { s: 1000, ms: 1, "": 1 };
Units.m = 60 * Units.s;
Units.h = 60 * Units.m;
Units.d = 24 * Units.h;
Units.w = 7 * Units.d;

export function parseTime(string) {
    const [t, rest] = ["w", "d", "h", "m", "s", "ms", ""].reduce(([t, rest], unit) => {
        const match = rest.match(new RegExp(`^\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}\\b`, "i"));
        return match ? [t + parseFloat(match[1]) * Units[unit], rest.slice(match[0].length)] : [t, rest];
    }, [0, string]);
    if (/\S/.test(rest)) {
        throw Error(`unable to parse "${string}"; went as far as "${rest}".`);
    }
    return t;
}

// Partition an array into two arrays according to a predicate. The first
// array of the pair contains all items from the source array for which the
// predicate is true, and the second array the items for which it is false.
export const partition = (xs, p) => xs.reduce(([t, f], x) => {
    (p(x) ? t : f).push(x);
    return [t, f];
}, [[], []]);

// Push an item to an array and return the item.
export function push(xs, x) {
    xs.push(x);
    return x;
}

// Create an iterator for all numbers between from and to, with a given step.
export function* range(from = 0, to = Infinity, step = 1) {
    const s = sign(step);
    if (s !== 0 && s * from <= s * to) {
        for (let i = 0; s * (from + i) <= s * to; i += step) {
            yield from + i;
        }
    }
}

// Remove the first occurrence of an item from an array and return it, assuming
// that it is present at least once.
export function remove(xs, x) {
    const index = xs.indexOf(x);
    console.assert(index >= 0);
    xs.splice(index, 1);
    return x;
}

// Fisher-Yates shuffle (https://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
export function shuffle(xs) {
    for (let i = xs.length - 1; i >= 1; --i) {
        const j = Math.floor(Math.random() * (i + 1));
        const x = xs[j];
        xs[j] = xs[i];
        xs[i] = x;
    }
    return xs;
}

// Sign of a number, with 0 for 0.
export const sign = x => x < 0 ? -1 : x > 0 ? 1 : 0;

// Ensure that an array has only a single item and return it.
export function single(xs) {
    if (xs.length === 1) {
        return xs[0];
    }
    throw Error("Expected a single value");
}

// snd(x, y) = y
export const snd = flip(I);

// Promise wrapper for setTimeout()
export const timeout = async t => new Promise(resolve => { setTimeout(resolve, t); });

// TODO
export function todo() {
    throw Error("TODO");
}

// Finer-grained typeof.
export const typeOf = x => typeof x !== "object" ? typeof x :
    x === null ? "null" :
    Array.isArray(x) ? "array" :
    x instanceof String ? "string" :
    x instanceof RegExp ? "regex" :
    x instanceof Map ? "map" :
    x instanceof Set ? "set" : "object";
