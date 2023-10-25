import { extend, nop } from "../util.js";
import { setModifier } from "./util.js";

const proto = {
    tag: "Effect",

    undo(f = nop) {
        return setModifier.call(this, "undo", f);
    },

    redo(f = nop) {
        return setModifier.call(this, "redo", f);
    },

    generate(thread, t) {
        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        thread.ops.push([
            (thread, vm) => { this.f(thread.value, vm.t); },
            (thread, vm) => { (this.modifiers?.undo ?? this.f)(thread.value, vm.t); },
            (thread, vm) => { (this.modifiers?.redo ?? this.f)(thread.value, vm.t); },
        ]);
        return t;
    }
};

// Create an instant from a function.
export const Effect = (f = nop) => extend(proto, { f });
