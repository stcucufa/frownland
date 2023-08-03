import { View } from "./view.js";
import { assign, create } from "../util.js";

export const Hstack = assign(properties => create(properties).call(Hstack), View, {
    renderAt(renderer, x, y) {
        x += this.x;
        y += this.y;
        for (const child of this.children) {
            child.renderAt(renderer, x, y);
            x += child.width;
        }
    }
});

export const Vstack = assign(properties => create(properties).call(Vstack), View, {
    renderAt(renderer, x, y) {
        x += this.x;
        y += this.y;
        for (const child of this.children) {
            child.renderAt(renderer, x, y);
            y += child.height;
        }
    }
});
