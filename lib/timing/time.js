import { isNumber, parseTime, safe } from "../util.js";

// Add times, may become unresolved if either is unresolved.
export const add = (x, y) => isUnresolved(x) ? (y === Infinity ? y : unresolved()) :
    (isUnresolved(y) ? (x === Infinity ? x : unresolved()) : x + y);

// Check a duration/time argument, which may be a string or a number, and return
// a number ≥ 0.
export function check(t) {
    if (typeof t === "string") {
        t = safe(parseTime)(t);
    }
    return isNumber(t) && t > 0 ? t : 0;
}

// Compare times, return a negative result if x < y, 0 if x = y, and positive
// if x > 0 (suitable for sorting and the priority queue).
export const cmp = (x, y) => {
    // Treat unresolved as indefinite—and return 0 when both values are
    // indefinite (or unresolved).
    const d = (isUnresolved(x) ? Infinity : x) - (isUnresolved(y) ? Infinity : y);
    return isNaN(d) ? 0 : d;
}

// Distinguish between unresolved, definite and indefinite times.
export const isUnresolved = t => !(t >= 0);
export const isDefinite = isFinite;
export const isIndefinite = t => t === Infinity;

// Max of two times.
export const max = (x, y) => typeof x === "number" ? (typeof y === "number" ? Math.max(x, y) : y) : x;

// Create a new unresolved time.
export const unresolved = () => ({});
