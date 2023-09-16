import { isNumber, parseTime, safe } from "../util.js";

// Add times, may become unresolved if either is unresolved
// TODO 2005 Should unresolved time + ∞ = ∞?
export const add = (x, y) => typeof x === "number" ? (typeof y === "number" ? x + y : y) : x;

// Compare times, return a negative result if x < y, 0 if x = y, and positive
// if x > 0 (suitable for sorting and the priority queue).
export const cmp = (x, y) => {
    // Treat unresolved as indefinite—and return 0 when both values are
    // indefinite (or unresolved).
    const d = (x ?? Infinity) - (y ?? Infinity);
    return isNaN(d) ? 0 : d;
}

// Max of two times.
export const max = (x, y) => typeof x === "number" ? (typeof y === "number" ? Math.max(x, y) : y) : x;

// Check a duration/time argument, which may be a string or a number, and return
// a number ≥ 0.
export function check(t) {
    if (typeof t === "string") {
        t = safe(parseTime)(t);
    }
    return isNumber(t) && t > 0 ? t : 0;
}
