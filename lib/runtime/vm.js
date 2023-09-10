import { K } from "../util.js";

export const Op = {

    begin: {
        delay: K,
        seq: K,
        par: item => function() {
            this.scope = [];
            return item;
        }
    },

    end: {
        delay: K,
        seq: K,
        par: item => function() {
            const i = this.stack.length - 1;
            console.assert(i >= 0);
            this.stack[i] = this.scope;
            delete this.scope;
            return item;
        }
    },

    instant: item => function() {
        const i = this.stack.length - 1;
        console.assert(i >= 0);
        this.stack[i] = item.f(this.stack[i]);
        return item;
    },

};
