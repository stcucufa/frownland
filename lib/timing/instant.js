import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate(thread) {
        thread.ops.at(-1).push(thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = this.f(thread.stack[i], thread.t);
            return this;
        });
    }
};

export const Instant = f => extend(proto, { f });
