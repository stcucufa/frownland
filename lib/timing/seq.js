import { extend, I, nop } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import { Par } from "./par.js";
import * as time from "./time.js";

const proto = {
    tag: "Seq",

    dur,

    // Generate code for the children, keeping track of time along the way. Set
    // the end if the dur modifier is set.
    generate(thread, t, items) {
        const pc = thread.ops.length;
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        const dur = this.modifiers?.dur;
        const end = time.add(t, dur ?? time.unresolved);
        if (time.isDefinite(end)) {
            // Reserve space for the cutoff thread.
            thread.do(nop);
        }
        const outgoing = items.get(this)[1];
        for (const child of this.children) {
            const childItem = wrap(child);
            outgoing.add(childItem);
            if (!items.has(childItem)) {
                items.set(childItem, [new Set(), new Set()]);
            }
            items.get(childItem)[0].add(this);
            t = childItem.generate(thread, t, items);
        }
        // A delay may be needed to ensure that the duration is extended.
        if (time.isResolved(end)) {
            if (time.isUnresolved(t) || end > t) {
                thread.ops.push([
                    (thread, vm) => { vm.schedule(thread, vm.t + dur); },
                    (thread, vm) => { vm.yield(thread); },
                    (thread, vm) => { vm.yield(thread); },
                ]);
            }
            if (time.cmp(t, end) > 0) {
                // Thread may need to be cutoff, so schedule a cutoff thread
                // at the beginning.
                const to = thread.ops.length;
                thread.ops[pc][0] = (thread, vm) => { vm.cutoff(thread, dur, pc + 1, to); };
            }
            t = end;
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    },
};

export const Seq = (...children) => extend(proto, { children });

// Seq/map is a kind of effect applied to all of its input values.
const SeqMap = {
    tag: "Seq/map",

    dur,

    get children() {
        return [this.item];
    },

    generate(thread, t, items) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));

        const dur = this.modifiers?.dur;
        const end = time.add(t, dur ?? time.unresolved);
        if (time.isDefinite(end)) {
            // Reserve space for the cutoff thread.
            thread.do(nop);
        }

        // Placeholder (initialize the thread; may skip to the end if the input
        // array is empty).
        thread.do(nop);

        const pc = thread.ops.length;

        // Push the next input from the array (which we know is not empty).
        thread.do(thread => {
            thread.value = thread.inputs.shift();
        });

        const childItem = wrap(this.item);
        items.get(this)[1].add(childItem);
        if (!items.has(childItem)) {
            items.set(childItem, [new Set(), new Set()]);
        }
        items.get(childItem)[0].add(this);
        childItem.generate(thread, t, items);
        t = time.unresolved;

        // Jump back as long as there are values, removing the last output
        // (to be replaced by the next).
        thread.do((thread, vm) => {
            thread.undo();
            if (thread.inputs.length > 0) {
                vm.pc = pc;
            }
        });

        const endPC = thread.ops.length;

        // We now know where to jump to the end.
        thread.ops[pc - 1][0] = (thread, vm) => {
            if (!Array.isArray(thread.value)) {
                throw Error("invalid value for map", { value: thread.value });
            }
            if (thread.value.length === 0) {
                vm.pc = endPC;
            } else {
                thread.inputs = thread.value;
            }
        };

        // A delay may be needed to ensure that the duration is extended.
        if (time.isResolved(end)) {
            if (time.isUnresolved(t) || end > t) {
                thread.ops.push([
                    (thread, vm) => { vm.schedule(thread, vm.t + dur); },
                    (thread, vm) => { vm.yield(thread); },
                    (thread, vm) => { vm.yield(thread); },
                ]);
            }
            if (time.cmp(t, end) > 0) {
                // Thread may need to be cutoff, so schedule a cutoff thread
                // at the beginning.
                const to = thread.ops.length;
                thread.ops[pc - 2][0] = (thread, vm) => {
                    const th = vm.cutoff(thread, dur, pc - 1, to);
                    th.do(() => { thread.undo(); });
                };
            }
            t = end;
        }

        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t }));
        return t;
    }
};

Seq.map = item => extend(SeqMap, { item });

// Gate(x, y) is a sort of Seq where we wait for x to end, but ignore its value.
// Useful with buttons.
export const Gate = (x, y) => Seq(Par(I, x), ([v]) => v, y);
