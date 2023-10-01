import { extend } from "../util.js";
import { Backward, Forward } from "../runtime/vm.js";
import * as time from "./time.js";

const proto = {
    tag: "Await",

    // Call an async function (or a function returning a promise) and wait for
    // its value to be resolved.
    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const end = time.add(t, this.modifiers?.dur);
        if (time.isResolved(end)) {
            thread.end = end;
        }
        thread.ops.push([
            typeof this.f === "function" ?
                (thread, vm) => { vm.then(thread, this.f(thread.value, vm.t)); } :
                (thread, vm) => {
                    const promise = thread.value;
                    if (typeof promise?.then !== "function") {
                        throw Error("invalid value for await (not a thenable)", { promise });
                    }
                    vm.then(thread, promise);
                },
            (thread, vm) => {
                thread.undo();
                vm.yield(thread, Backward);
            },
            (thread, vm) => {
                thread.redo();
                vm.yield(thread, Forward);
            }
        ]);
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));
        return end;
    }
};

// Create an await from a function.
export const Await = f => extend(proto, { f });
