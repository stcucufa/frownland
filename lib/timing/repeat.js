import { extend, nop } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Repeat",

    // Repeat is a container that only has a single child.
    get children() {
        return [this.child];
    },

    dur,

    // Generate code for the child and add a jump back to the beginning at the
    // end. In order to rewind, also add a jump forward to the end at the
    // beginning when going backward.
    generate(thread, t, items) {
        const pc = thread.ops.length;
        thread.timeline.push(extend(this, { begin: true, pc, t }));

        let childEnd = t;
        const childItem = wrap(this.child);
        if (!items.has(childItem)) {
            items.set(childItem, [new Set(), new Set()]);
        }
        items.get(this)[1].add(childItem);
        items.get(childItem)[0].add(this);

        const n = this.modifiers?.take ?? Infinity;
        const end = t + (this.modifiers?.dur ?? Infinity);
        const hasDur = time.isDefinite(end);

        if (n > 0) {
            const init = thread => { thread.repeatIndex = 0; };
            thread.ops.push([init, nop, init]);
            childEnd = childItem.generate(thread, t, items);
            if (childEnd === t && !isFinite(n)) {
                throw Error("cannot repeat a zero-duration child", this.child);
            }
            const back = (thread, vm) => {
                if (++thread.repeatIndex < n) {
                    vm.pc = pc;
                } else {
                    delete thread.repeatIndex;
                }
            };
            thread.ops.push([back, nop, back]);
            // Patch the jump from the beginning for rewind.
            const dest = thread.ops.length - 1;
            thread.ops[pc][1] = (thread, vm) => {
                if (thread.repeatIndex-- >= 0) {
                    vm.pc = dest;
                } else {
                    delete thread.repeatIndex;
                }
            };
        }

        // Adjust the end time for a finite number of iterations.
        if (isFinite(n)) {
            // Wait for the end of the duration (no need to wait in case of
            // infinite number of iterations since the duration can only be cut
            // off).
            if (hasDur) {
                thread.ops.push([
                    (thread, vm) => { vm.schedule(thread, end); },
                    (thread, vm) => { vm.yield(thread); },
                    (thread, vm) => { vm.yield(thread); },
                ]);
            } else {
                // In case of a finite number of iterations, the duration
                // becomes definite (if the child duration is) or unresolved.
                end = time.isDefinite(childEnd) ? t + (childEnd - t) * n : time.unresolved;
            }
        }

        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));
        return end;
    }
};

export const Repeat = child => extend(proto, { child });
