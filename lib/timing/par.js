import { del, extend, foldit, isObject, K, push, single, values } from "../util.js";
import { generate } from "../runtime/thread.js";
import { wrap } from "./instant.js";
import { dur, take } from "./util.js";
import * as time from "./time.js";

const proto = {
    tag: "Par",

    dur,
    take,

    // Generate code for the children, creating a child thread for each. When
    // the par begins, some state is initialized to keep track of the results,
    // then wait for all children to finish and update the value at the end.
    generate(thread, t, items) {
        thread.timeline.push(extend(this, { begin: true, pc: thread.ops.length, t }));
        const isNamed = !Array.isArray(this.children);
        const childCount = isNamed ? values(this.children).length : this.children.length;

        // Check that we have enough children to take.
        const hasDefiniteTake = Number.isFinite(this.modifiers?.take);
        if (hasDefiniteTake && childCount < this.modifiers.take) {
            throw Error(`Insufficient number of children (${
                childCount
            }) for Par.take(${
                this.modifiers.take
            })`);
        }

        const begin = t;
        const dur = this.modifiers?.dur ?? time.unresolved;
        const hasDur = time.isResolved(dur);
        const end = time.add(t, dur);
        const takeNone = this.modifiers?.take === 0;
        const takeSome = this.modifiers?.take < childCount;
        const empty = takeNone || childCount === 0;

        // Initialize state for this iteration of the par.
        thread.do((thread, vm) => {
            thread.parState = {
                accumulator: isNamed ? {} : [],
                begin: vm.t,
                children: new Set(),
                initialValue: thread.value,
                complete: empty
            };
        });

        // Create subthreads for children (if any).
        if (!empty) {
            const takeAny = this.modifiers?.take >= 0;
            const targetCount = hasDefiniteTake ? this.modifiers.take : childCount;
            const outgoing = items.get(this)[1];

            // Generate threads for children and track the maximum end time.
            // When a thread ends, it pushes its value to the accumulator.

            const generateChild = (t, child, accumulate) => {
                const childItem = wrap(child);
                outgoing.add(childItem);
                const childThread = push(thread.ops, generate(childItem, begin, items));
                items.get(childItem)[0].add(this);
                t = time.max(t, childThread.end);
                childThread.do((childThread, vm) => {
                    accumulate(childThread);
                    thread.parState.children.delete(childThread);
                    if (childCount - thread.parState.children.size === targetCount) {
                        // When enough children have ended, the parent thread
                        // can be awakened, and the remaining child threads are
                        // cancelled.
                        thread.parState.complete = true;
                        vm.wake(thread, hasDur ? thread.parState.begin + dur : vm.t);
                        for (const child of thread.parState.children) {
                            child.cancel();
                        }
                        thread.parState.children.clear();
                    }
                });
                thread.timeline.push(childThread);
                return t;
            };

            if (isNamed) {
                // For named parameters, keep track of both name and value of
                // the children.
                for (const name in this.children) {
                    t = generateChild(t, this.children[name], childThread => {
                        thread.parState.accumulator[name] = childThread.value;
                    });
                }
            } else {
                // Otherwise just push to the accumulator, or add at the child
                // position (depending on whether we use take or not).
                t = this.children.reduce((t, child, i) => generateChild(
                    t, child, takeAny ? childThread => {
                        thread.parState.accumulator.push(childThread.value);
                    } : childThread => {
                        thread.parState.accumulator[i] = childThread.value;
                    }
                ), t);
            }

            if (takeSome) {
                t = time.unresolved;
            }
            // Suspend the thread to wait for the child threads to end (even
            // when they all have a zero duration).
            thread.ops.push([
                (thread, vm) => { vm.schedule(thread, hasDur ? end : time.unresolved); },
                (thread, vm) => { vm.yield(thread); },
                (thread, vm) => { vm.yield(thread); },
            ]);
        }

        // Set the value of the thread as that of the accumulator.
        thread.ops.push([
            thread => {
                const { accumulator, children, complete, initialValue } = del(thread, "parState");
                if (complete) {
                    console.assert(children.size === 0);
                    thread.value = this.tag === "Par" ? accumulator :
                        (isNamed ? single(Object.values(accumulator)) : single(accumulator));
                } else {
                    for (const child of children) {
                        child.cancel();
                    }
                    thread.value = initialValue;
                }
            },
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
    children: getChildren(children)
});

// First is just like Par().take(1) but has a single value instead of an array
// with a single value.
const first = extend(proto, { tag: "First" });
export const First = (...children) => extend(first, {
    children: getChildren(children),
    modifiers: {
        take: 1
    }
});

const getChildren = children =>
    children.length === 1 && isObject(children[0]) && !Array.isArray(children[0]) &&
        values(children[0]).every(
            child => typeof child === "function" || (isObject(child) && typeof child.tag === "string")
        )? children[0] : children;
