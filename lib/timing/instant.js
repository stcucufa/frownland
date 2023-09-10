import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate([ops]) {
        ops.push(thread => {
            const i = thread.stack.length - 1;
            console.assert(i >= 0);
            thread.stack[i] = this.f(thread.stack[i]);
            return this;
        });
    }
};

export const Instant = f => extend(proto, { f });
