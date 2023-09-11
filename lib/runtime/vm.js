export const Thread = () => ({ ops: [] });

const proto = {
    add(item, t = 0) {
        const thread = Object.assign(Thread(), { t });
        thread.end = item.generate(thread, t);
        return thread;
    },

    run(thread) {
        for (const op of thread.ops) {
            if (typeof op === "function") {
                op(thread);
            } else {
                op.value = thread.value;
                op.t = thread.t;
                this.run(op);
                thread.accumulator.push(op.value);
                delete op.value;
                delete op.t;
            }
        }
    }
};

export const VM = () => Object.create(proto);
