import { extend } from "../util.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Event",

    show() {
        return `Event(${this.type})`;
    },

    dur,

    // Listen to the event and wait for it to occur.
    generate(thread, t) {
        thread.timeline.push(extend(this, { pc: thread.ops.length, t }));
        thread.ops.push([
            (thread, vm) => { vm.listen(thread, this); },
            (thread, vm) => {
                thread.undo();
                vm.yield(thread);
            },
            (thread, vm) => {
                thread.redo();
                vm.yield(thread);
            }
        ]);
        const end = time.add(t, this.modifiers?.dur ?? time.unresolved);
        return end;
    }
};

// Create an await from a function.
export const Event = (target, type, child) => extend(proto, { target, type });
