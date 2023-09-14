import { extend, K, push } from "../util.js";
import { Thread } from "../runtime.js";

const proto = {
    tag: "Par",
    
    generate(thread, t) {
        const accumulator = [];
        thread.ops.push(K(this));
        const begin = t;
        t = this.children.reduce(
            (t, child, i) => {
                const childThread = push(thread.ops, Thread());
                t = Math.max(t, child.generate(childThread, begin));
                childThread.ops.push(thread => {
                    accumulator[i] = thread.value;
                    return this;
                });
                return t;
            }, t
        );
        if (t > thread.t) {
            thread.ops.push((thread, vm) => {
                vm.schedule(thread, t);
                return this;
            });
        }
        thread.ops.push(thread => {
            thread.value = accumulator;
            return this;
        });
        return t;
    }
};

export const Par = (...children) => extend(proto, { children });
