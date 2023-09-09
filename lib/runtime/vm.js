import { K } from "../util.js";

export const Op = {

    begin: K,
    end: K,

    instant: item => function() {
        const n = this.stack.length;
        console.assert(n > 0);
        this.stack[n] = item.f(this.stack[n]);
        return item;
    },

};
