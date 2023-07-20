// Get the begin/end time of an instance (either an occurrence with t, or an
// interval with begin/end).
export const beginOf = x => x?.begin ?? x?.t;
export const endOf = x => x?.end ?? x?.t;

// Generic show function for items, using their tag and children length.
export function show() {
    return this.children ? `${this.tag}/${this.children.length}` : this.tag;
}
