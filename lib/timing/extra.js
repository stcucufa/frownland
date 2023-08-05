import { Seq } from "./seq.js";
import { Instant } from "./instant.js";

// Sequence of x and y ignoring the output of x; useful for events that only
// serve as trigger but don’t have a value of their own.
export function gate(x, y) {
    const label = Symbol();
    return Seq(x, Instant(([_, input]) => input).var(label), y).label(label);
};
