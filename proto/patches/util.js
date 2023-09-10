import { html } from "../../lib/util.js";

// Create a button with a label and an action on click.
export function button(label, f) {
    const button = html("button", { type: "button" }, label);
    button.addEventListener("click", f);
    return button;
}
