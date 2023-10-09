import { extend, K, nop, push } from "../util.js";
import { generate } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",

    dur,

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const accumulator = [];
        let unresolved = 0;
        const begin = t;
        const end = time.add(t, this.modifiers?.dur ?? time.unresolved);
        const hasDur = time.isResolved(end);

        // Generate threads for children and track the maximum end time. When a
        // thread ends, it pushes its value to the accumulator.
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, generate(wrap(child), begin));
                t = time.max(t, childThread.end);
                const op = [
                    thread => { accumulator[i] = thread.value; },
                    nop,
                    nop
                ];
                if (time.isUnresolved(childThread.end)) {
                    unresolved += 1;
                    op[0] = (childThread, vm) => {
                        accumulator[i] = childThread.value;
                        if (--unresolved === 0) {
                            vm.wake(thread);
                        }
                    };
                }
                if (time.cmp(childThread.end, end) > 0) {
                    childThread.end = end;
                }
                childThread.ops.push(op);
                thread.timeline.push(childThread);
                return t;
            }, t
        );

        if (this.children.length > 0) {
            // Suspend the thread to wait for the child threads to end (even
            // when they all have a zero duration).
            const parEnd = hasDur ? time.max(t, end) : t;
            thread.ops.push([
                (thread, vm) => { vm.schedule(thread, parEnd); },
                (thread, vm) => { vm.yield(thread); },
                (thread, vm) => { vm.yield(thread); },
            ]);
        }

        // Set the value of the thread to the accumulator.
        thread.ops.push([
            thread => { thread.value = accumulator; },
            thread => { thread.undo(); },
            thread => { thread.redo(); }
        ]);

        if (hasDur) {
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
