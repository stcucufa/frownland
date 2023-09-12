import { isNumber, parseTime, safe } from "../util.js";

// Set a modifier on an item and return it.
function setModifier(name, value) {
    if (this.modifiers) {
        console.assert(!Object.hasOwn(this.modifiers, name));
    } else {
        this.modifiers = {};
    }
    this.modifiers[name] = value;
    return this;
}

// Set the duration of an item with dur. The duration is a number of
// milliseconds or a time string and must be greater than or equal to zero.
export function durBetween(min, max) {
    if (typeof min === "string") {
        min = safe(parseTime)(min);
    }
    if (typeof max === "string") {
        max = safe(parseTime)(max);
    }
    if (isNumber(min) && isNumber(max) && min >= 0 && max >= min) {
        return setModifier.call(this, "dur", [min, max]);
    }
    return this;
}

export function dur(d) {
    return this.durBetween(d, d);
}

export function durMin(d) {
    return this.durBetween(d, Infinity);
}

export function durMax(d) {
    return this.durBetween(0, d);
}
