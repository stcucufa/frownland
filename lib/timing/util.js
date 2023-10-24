import { isNumber, parseTime, safe } from "../util.js";

// Set a modifier on an item and return it.
export function setModifier(name, value) {
    if (this.modifiers) {
        if (Object.hasOwn(this.modifiers, name)) {
            return this;
        }
    } else {
        this.modifiers = {};
    }
    this.modifiers[name] = value;
    return this;
}

// Simple, value-less modifier set to true.
export function modifier(name) {
    return function() {
        return setModifier.call(this, name, true);
    };
}

// Set the duration of an item with dur. The duration is a number of
// milliseconds or a time string and must be greater than or equal to zero.
export function dur(duration) {
    if (typeof duration === "string") {
        duration = safe(parseTime)(duration);
    }
    if (isNumber(duration) && duration >= 0) {
        return setModifier.call(this, "dur", duration);
    }
    return this;
}

// Set the capacity of an item with take, i.e., the first n children to take.
export function take(n = Infinity) {
    if (isNumber(n) && n >= 0) {
        return setModifier.call(this, "take", n);
    }
    return this;
}
