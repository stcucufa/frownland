import { assign, create } from "../util.js";

// A basic node in the scene graph with children.
export const Node = assign(properties => create(properties).call(Node), {
    init() {
        if (this.children) {
            console.assert(Array.isArray(this.children));
            for (const child of this.children) {
                child.remove();
                child.parent = this;
            }
        } else {
            this.children = [];
        }
    },

    x: 0,
    y: 0,
    width: 0,
    height: 0,

    // Append a child node at the end of the list of children, setting the
    // parent of the added child. The child is removed from its previous
    // parent, if any. Return this added child.
    appendChild(child) {
        child.remove();
        child.parent = this;
        this.children.push(child);
        return child;
    },

    // Remove a node from its parent if any; no effect otherwise. Return self.
    remove() {
        const index = this.parent?.children.indexOf(this);
        if (index >= 0) {
            this.parent.children.splice(index, 1);
            delete this.parent;
        }
        console.assert(!this.parent);
        return this;
    },

    // Render the node through a renderer.
    renderAt(renderer, x, y) {
        x += this.x;
        y += this.y;
        renderer.renderNodeAt(this, x, y);
        for (const child of this.children) {
            child.renderAt(renderer, x, y);
        }
    }
});
