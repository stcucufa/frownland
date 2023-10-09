import { extend, K, nop, push } from "../util.js";
import { generate } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import { dur, take } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",

    dur,
    take,

    generate(thread, t) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const accumulator = [];
        let unresolved = 0;
        const begin = t;
        const end = time.add(t, this.modifiers?.dur ?? time.unresolved);
        const hasDur = time.isResolved(end);

        // Check that we have enough children to take.
        const hasDefiniteTake = Number.isFinite(this.modifiers?.take);
        if (hasDefiniteTake && this.children.length < this.modifiers.take) {
            throw Error(`Insufficient number of children (${
                this.children.length
            }) for Par.take(${
                this.modifiers.take
            })`);
        }

        const takeNone = this.modifiers?.take === 0;
        const takeSome = this.modifiers?.take < this.children.length;
        if (!takeNone) {
            const takeAny = this.modifiers?.take >= 0;
            // Generate threads for children and track the maximum end time.
            // When a thread ends, it pushes its value to the accumulator.
            t = this.children.reduce((t, child, i) => {
                const accumulate = takeAny ?
                    (childThread, vm) => {
                        // Difference between the number of items to take
                        // and the number of items in the accumulator.
                        const diff = this.modifiers.take - accumulator.length;
                        if (diff > 0) {
                            accumulator.push(childThread.value);
                            if (takeSome && diff === 1) {
                                // The last item was added to the
                                // accumulator so the par has ended.
                                vm.wake(thread);
                            }
                        }
                    } :
                    childThread => { accumulator[i] = childThread.value; };
                const childThread = push(thread.ops, generate(wrap(child), begin));
                t = time.max(t, childThread.end);
                const op = [accumulate, nop, nop];
                if (time.isUnresolved(childThread.end)) {
                    unresolved += 1;
                    op[0] = (childThread, vm) => {
                        accumulate(childThread);
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
            }, t);

            if (this.children.length > 0) {
                if (takeSome) {
                    t = time.unresolved;
                }
                // Suspend the thread to wait for the child threads to end (even
                // when they all have a zero duration).
                const parEnd = hasDur ? time.max(t, end) : t;
                thread.ops.push([
                    (thread, vm) => { vm.schedule(thread, parEnd); },
                    (thread, vm) => { vm.yield(thread); },
                    (thread, vm) => { vm.yield(thread); },
                ]);
            }
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
