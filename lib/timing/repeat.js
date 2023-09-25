import { extend, nop } from "../util.js";
import { wrap } from "./instant.js";
import { dur } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Repeat",

    get children() {
        return [this.child];
    },

    dur,

    // Generate code for the child and add a jump back to the beginning at the
    // end. In order to rewind, also add a jump forward to the end at the
    // beginning when going backward.
    generate(thread, t) {
        const pc = thread.ops.length;

        // DEBUG
        // const jump = [nop];
        const jump = [(thread, vm) => { console.log(`>>> [${vm.t}=${thread.value}] REPEAT`); }];

        thread.ops.push(jump);
        thread.timeline.push(extend(this, { begin: true, pc, t }));
        let end = Infinity;
        if (time.isDefinite(this.modifiers?.dur)) {
            end = t + this.modifiers.dur;
            thread.ops.push([
                (thread, vm) => { vm.timeout(thread, end); },
                (thread, vm) => TODO
            ]);
        }
        if (wrap(this.child).generate(thread, t) === t) {
            throw new Error("cannot repeat a zero-duration child", this.child);
        }
        thread.timeline.push(extend(this, { end: true, pc: thread.ops.length, t: end }));

        // DEBUG
        thread.ops.push([
            // thread => { thread.pc = pc; },
            (thread, vm) => {
                console.log(`<<< [${vm.t}=${thread.value} -> ${pc}] REPEAT`);
                thread.pc = pc;
            },
            (thread, vm) => { console.log(`>>> [${vm.t}=${thread.value}] TAEPER`); }
        ]);

        // Set the jump from the beginning for rewind
        const dest = thread.ops.length - 1;

        // DEBUG
        // jump.push(thread => { thread.pc = dest; });
        jump.push((thread, vm) => {
            console.log(`<<< [${vm.t}=${thread.value} <- ${dest}] TAEPER`);
            thread.pc = dest;
        });

        return end;
    }
};

export const Repeat = child => extend(proto, { child });
