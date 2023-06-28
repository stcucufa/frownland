export function bringElementFrontward(element) {
    element.parentElement.appendChild(element);
}

export function deselectText() {
    const selection = window.getSelection();
    selection.removeAllRanges();
    return selection;
}

