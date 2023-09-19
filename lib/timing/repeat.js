import { extend } from "../util.js";
import { wrap } from "./instant.js";

const proto = {
    tag: "Repeat",

    get children() {
        return [this.child];
    },

    generate(thread, t) {
        const pc = thread.ops.length;
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        if (wrap(this.child).generate(thread, t) === t) {
            throw new Error("cannot repeat a zero-duration child", this.child);
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: Infinity }));
        thread.ops.push(thread => { thread.pc = pc; });
        return Infinity;
    }
};

export const Repeat = child => extend(proto, { child });
