import { extend } from "../util.js";

const proto = {
    tag: "Instant",

    generate(thread, t) {
        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        thread.ops.push([
            (thread, vm) => {
                thread.value = this.f(thread.value, vm.t);
                console.log("+++ DO", thread.value);
            },
            thread => {
                thread.undo();
                console.log("--- UNDO", thread.value);
            },
            thread => {
                thread.redo();
                console.log("... REDO", thread.value);
            }
        ]);
        return t;
    }
};

// Create an instant from a function.
export const Instant = f => extend(proto, { f });

// Wrap a function into an Instant, or just return the instant.
export const wrap = x => typeof x === "function" ? Instant(x) : x;
