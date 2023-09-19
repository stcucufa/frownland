import { extend } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Repeat",

    get children() {
        return [this.child];
    },

    dur,

    generate(thread, t) {
        const pc = thread.ops.length;
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        let end = Infinity;
        if (time.isDefinite(this.modifiers?.dur)) {
            end = t + this.modifiers.dur;
            thread.ops.push((thread, vm) => { vm.timeout(thread, end); });
        }
        if (wrap(this.child).generate(thread, t) === t) {
            throw new Error("cannot repeat a zero-duration child", this.child);
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));
        thread.ops.push(thread => { thread.pc = pc; });
        return end;
    }
};

export const Repeat = child => extend(proto, { child });
