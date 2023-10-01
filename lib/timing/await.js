import { extend } from "../util.js";
import { Backward, Forward } from "../runtime/vm.js";
import * as time from "./time.js";

const proto = {
    tag: "Await",

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const end = time.add(t, this.modifiers?.dur);
        if (time.isResolved(end)) {
            thread.end = end;
        }
        thread.ops.push([
            (thread, vm) => { vm.then(thread, this.f(thread.value, vm.t)); },
            thread => { thread.undo(); },
            thread => { thread.redo(); }
        ]);
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));
        return end;
    }
};

// Create an await from a function.
export const Await = f => extend(proto, { f });
