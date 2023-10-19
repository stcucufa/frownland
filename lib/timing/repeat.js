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
        const jump = [nop, nop, nop];
        thread.ops.push(jump);
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        const end = t + (this.modifiers?.dur ?? Infinity);
        const childItem = wrap(this.child);
        if (!items.has(childItem)) {
            items.set(childItem, [new Set(), new Set()]);
        }
        items.get(this)[1].add(childItem);
        items.get(childItem)[0].add(this);
        if (childItem.generate(thread, t, items) === t) {
            throw new Error("cannot repeat a zero-duration child", this.child);
        }
        thread.ops.push([
            (thread, vm) => {
                console.log(`Repeat @${vm.t}`, thread.value);
                vm.pc = pc;
            },
            nop,
            (_, vm) => { vm.pc = pc; }
        ]);
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));

        // Set the jump from the beginning for rewind.
        const dest = thread.ops.length - 1;
        jump[1] = (_, vm) => { vm.pc = dest; };
        return end;
    }
};

export const Repeat = child => extend(proto, { child });
