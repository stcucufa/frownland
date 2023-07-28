export function bringElementFrontward(element) {
    element.parentElement.appendChild(element);
}

export function deselectText() {
    const selection = window.getSelection();
    selection.removeAllRanges();
    return selection;
}

// Test whether two rectangles { x, y, width, height } overlap.
export const overlap = (a, b) => (a.x < (b.x + b.width)) && ((a.x + a.width) > b.x) &&
    (a.y < (b.y + b.height)) && ((a.y + a.height) > b.y);

// Remove all foreign objects of an element
// TODO 1T0C Clear element contents (move to lib/utils, with tests).
export function removeChildren(node) {
    for (let child = node.firstChild; child;) {
        const sibling = child.nextSibling;
        child.remove();
        child = sibling;
    }
}
