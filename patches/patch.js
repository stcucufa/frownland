import { assign, create } from "../lib/util.js";

export const Patch = assign(() => create().call(Patch), {
    init() {
        this.id = Math.random().toString(36).substr(2, 7);
    }
});
