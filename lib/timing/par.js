import { extend, isObject, K, nop, push, single, values } from "../util.js";
import { generate } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import { dur, take } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",

    dur,
    take,

    generate(thread, t, items) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const isNamed = !Array.isArray(this.children);
        const childCount = isNamed ? values(this.children).length : this.children.length;
        const accumulator = isNamed ? {} : [];
        let unresolved = 0;
        const begin = t;
        const end = time.add(t, this.modifiers?.dur ?? time.unresolved);
        const hasDur = time.isResolved(end);
        const children = new Set();

        // Check that we have enough children to take.
        const hasDefiniteTake = Number.isFinite(this.modifiers?.take);
        if (hasDefiniteTake && childCount < this.modifiers.take) {
            throw Error(`Insufficient number of children (${
                childCount
            }) for Par.take(${
                this.modifiers.take
            })`);
        }

        const takeNone = this.modifiers?.take === 0;
        const takeSome = this.modifiers?.take < childCount;
        if (!takeNone) {
            const takeAny = this.modifiers?.take >= 0;
            const outgoing = items.get(this)[1];

            // Generate threads for children and track the maximum end time.
            // When a thread ends, it pushes its value to the accumulator.

            const generateChild = (t, child, accumulate) => {
                const childItem = wrap(child);
                outgoing.add(childItem);
                const childThread = push(thread.ops, generate(childItem, begin, items));
                items.get(childItem)[0].add(this);
                children.add(childThread);
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
            };

            function childThreadIsDone(vm, diff) {
                if (takeSome && diff === 1) {
                    // The last item was added to the accumulator so the par is
                    // done and the rest of the children will be cancelled.
                    vm.wake(thread, hasDur ? end : vm.t);
                    for (const child of children) {
                        child.cancel();
                    }
                }
            }

            if (isNamed) {
                // For named parameters, keep track of both name and value of
                // the children.
                for (const name in this.children) {
                    t = generateChild(t, this.children[name], takeAny ? (childThread, vm) => {
                        children.delete(childThread);
                        // Difference between the number of items to take
                        // and the number of items in the accumulator.
                        const diff = this.modifiers.take - Object.keys(accumulator).length;
                        if (diff > 0) {
                            accumulator[name] = childThread.value;
                            childThreadIsDone(vm, diff);
                        }
                    } : childThread => { accumulator[name] = childThread.value; });
                }
            } else {
                // Otherwise just push to the accumulator, or add at the child
                // position (depending on whether we use take or not).
                t = this.children.reduce((t, child, i) => generateChild(
                    t, child, takeAny ? (childThread, vm) => {
                        children.delete(childThread);
                        // Difference between the number of items to take
                        // and the number of items in the accumulator.
                        const diff = this.modifiers.take - accumulator.length;
                        if (diff > 0) {
                            accumulator.push(childThread.value);
                            childThreadIsDone(vm, diff);
                        }
                    } : childThread => { accumulator[i] = childThread.value; }
                ), t);
            }

            if (childCount > 0) {
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
        const value = this.tag === "Par" ?
            thread => { thread.value = accumulator; } :
            thread => { thread.value = single(accumulator); };
        thread.ops.push([
            value,
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

// Distinguish between a regular array of children and named children (which
// must all be items or functions).
export const Par = (...children) => extend(proto, {
    children: children.length === 1 && isObject(children[0]) && !Array.isArray(children[0]) &&
        values(children[0]).every(
            child => typeof child === "function" || (isObject(child) && typeof child.tag === "string")
        )? children[0] : children
});

// First is just like Par().take(1) but has a single value instead of an array
// with a single value (so naming children does not really make sense in that
// case).
const first = extend(proto, { tag: "First" });
export const First = (...children) => extend(first, {
    children,
    modifiers: {
        take: 1
    }
});
