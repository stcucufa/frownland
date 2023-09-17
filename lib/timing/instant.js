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

export const Instant = f => extend(proto, { f });

export const wrap = x => typeof x === "function" ? Instant(x) : x;
