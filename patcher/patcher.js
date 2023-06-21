import { svg } from "../lib/util.js";

const DragEventListener = {
    handleEvent(event) {
        switch (event.type) {
            case "pointerdown":
                document.addEventListener("pointermove", this);
                document.addEventListener("pointerup", this);
                document.addEventListener("pointercancel", this);
                event.preventDefault();
                this.box = event.target;
                this.x = parseFloat(this.box.getAttribute("x"));
                this.y = parseFloat(this.box.getAttribute("y"));
                this.x0 = event.clientX;
                this.y0 = event.clientY;
                break;
            case "pointermove":
                this.box.setAttribute("x", this.x + event.clientX - this.x0);
                this.box.setAttribute("y", this.y + event.clientY - this.y0);
                break;
            case "pointercancel":
                this.box.setAttribute("x", this.x);
                this.box.setAttribute("y", this.y);
            case "pointerup":
                delete this.x0;
                delete this.y0;
                delete this.x;
                delete this.y;
                delete this.box;
                document.removeEventListener("pointermove", this);
                document.removeEventListener("pointerup", this);
                document.removeEventListener("pointercancel", this);
        }
    }
};

const DocumentEventListener = {
    x: 0,
    y: 0,

    handleEvent(event) {
        switch (event.type) {
            case "pointermove":
                this.x = event.clientX;
                this.y = event.clientY;
                break;
            case "keyup":
                if (event.key === "n") {
                    addBox();
                }
        }
    }
};

document.addEventListener("pointermove", DocumentEventListener);
document.addEventListener("keyup", DocumentEventListener);

const canvas = document.querySelector("svg.canvas");

function addBox() {
    const box = canvas.appendChild(svg("use", {
        href: "#box",
        x: DocumentEventListener.x,
        y: DocumentEventListener.y
    }));
    box.addEventListener("pointerdown", DragEventListener);
}
