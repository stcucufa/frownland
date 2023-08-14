import { assign, create, html } from "../lib/util.js";

export const Patch = assign(() => create().call(Patch), {
    init() {
        this.id = Math.random().toString(36).substr(2, 7);
    }
});

export const PatchView = assign(patch => create({ patch }).call(PatchView), {
    init() {
        this.element = html("li", `Patch ${this.patch.id}`);
    }
});
