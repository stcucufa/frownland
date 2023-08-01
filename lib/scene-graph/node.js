import { assign, create } from "../util.js";

// A basic node in the scene graph with children.
export const Node = assign(() => create().call(Node), {
    init() {
        this.children = [];
    },

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
    }
});
