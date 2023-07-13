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
