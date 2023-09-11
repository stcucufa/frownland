export const Thread = () => ({ ops: [] });

const proto = {
    add(item, t = 0) {
        const thread = Object.assign(Thread(), { stack: [null], t });
        thread.end = item.generate(thread, t);
        return thread;
    },

    run(thread) {
        for (const op of thread.ops) {
            if (typeof op === "function") {
                op(thread);
            } else {
                op.stack = thread.stack.slice();
                op.t = thread.t;
                this.run(op);
                thread.scope.push(op.stack.at(-1));
                delete op.stack;
                delete op.t;
            }
        }
    }
};

export const VM = () => Object.create(proto);
