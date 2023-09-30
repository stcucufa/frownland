import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate(thread, t) {
        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        thread.ops.push([
            (thread, vm) => { thread.value = this.f(thread.value, vm.t); },
            thread => { thread.undo(); },
            thread => { thread.redo(); }
        ]);
        return t;
    }
};

// Create an instant from a function.
export const Instant = f => extend(proto, { f });

// Wrap a function into an Instant, or just return the instant.
export const wrap = x => typeof x === "function" ? Instant(x) : x;
