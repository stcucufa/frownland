import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate(thread, t) {
        thread.ops.push(thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = this.f(thread.stack[i], thread.t);
            return this;
        });
        return t;
    }
};

export const Instant = f => extend(proto, { f });
