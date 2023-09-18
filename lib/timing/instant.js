import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate(thread, t) {
        thread.ops.push(thread => {
            thread.value = this.f(thread.value, thread.t);
            return this;
        });
        return t;
    }
};

// Create an instant from a function.
export const Instant = f => extend(proto, { f });

// Wrap a function into an Instant, or just return the instant.
export const wrap = x => typeof x === "function" ? Instant(x) : x;
