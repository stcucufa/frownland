import { extend } from "../util.js";
import { modifier } from "./util.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Event",

    show() {
        return `Event(${this.type})`;
    },

    // Modifiers

    dur,
    preventDefault: modifier("preventDefault"),
    stopImmediatePropagation: modifier("stopImmediatePropagation"),
    stopPropagation: modifier("stopPropagation"),

    // Listen to the event and wait for it to occur.
    generate(thread, t) {
        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        const dur = this.modifiers?.dur ?? time.unresolved;
        thread.ops.push([
            (thread, vm) => { vm.listen(thread, this, dur); },
            (thread, vm) => {
                thread.undo();
                vm.yield(thread);
            },
            (thread, vm) => {
                thread.redo();
                vm.yield(thread);
            }
        ]);
        return time.add(t, dur);
    }
};

// Create an await from a function.
export const Event = (target, type, child) => extend(proto, { target, type });
