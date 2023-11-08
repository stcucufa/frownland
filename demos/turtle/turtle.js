import { VM } from "../../lib/runtime.js";
import { Ramp, First, Seq, Repeat, Effect } from "../../lib/timing.js";

const vm = VM().start();

const canvas = document.querySelector("canvas");
const WIDTH = canvas.clientWidth;
const HEIGHT = canvas.clientHeight;

const context = canvas.getContext("2d");

window.Turtle = {
    position: [WIDTH / 2, HEIGHT / 2],
    heading: 0,
    penColor: "black",
    s: 8,
    paths: [],
    isPenUp: true,
    velocity: 2,

    draw() {
        canvas.width = WIDTH * window.devicePixelRatio;
        canvas.height = HEIGHT * window.devicePixelRatio;

        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.save();
        context.scale(window.devicePixelRatio, window.devicePixelRatio);

        for (const [p, q, color] of this.paths) {
            context.beginPath();
            context.moveTo(p[0], p[1]);
            context.lineTo(q[0], q[1]);
            context.strokeStyle = color;
            context.stroke();
        }

        if (this.drawFrom && !this.isPenUp) {
            context.beginPath();
            context.moveTo(this.drawFrom[0], this.drawFrom[1]);
            context.lineTo(this.position[0], this.position[1]);
            context.strokeStyle = this.penColor;
            context.stroke();
        }

        // Draw self
        context.save();
        context.translate(this.position[0], this.position[1]);
        context.rotate(this.theta);
        context.beginPath();
        context.moveTo(-this.s, -this.s);
        context.lineTo(this.s, 0);
        context.lineTo(-this.s, this.s);
        context.closePath();
        context.strokeStyle = this.penColor;
        context.stroke();
        context.beginPath();
        context.arc(0, 0, 1.5, 0, 2 * Math.PI);
        context.fillStyle = this.penColor;
        context.fill();
        context.restore();

        context.restore();
    },

    forward(d) {
        const dur = d * this.velocity;
        return Seq(
            () => {
                this.drawFrom = this.position;
                return [this.position, d * Math.cos(this.theta), d * Math.sin(this.theta)]
            },
            Ramp(
                ([position, dx, dy], p) => {
                    const nextPosition = [position[0] + p * dx, position[1] + p * dy];
                    if (p === 1) {
                        this.paths.push([position.slice(), nextPosition.slice(), this.color]);
                    }
                    return nextPosition;
                }
            ).dur(dur).set(this).property("position"),
            Effect(() => { delete this.drawFrom; })
        );
    },

    back(d) {
        return this.forward(-d);
    },

    right(a) {
        const dur = a * this.velocity;
        return Seq(
            () => this.heading,
            Ramp((heading, p) => heading + p * a).dur(dur).set(this).property("heading"),
        );
    },

    left(a) {
        return this.right(-a);
    },

    penup() {
        this.isPenUp = true;
    },

    pendown() {
        if (this.isPenUp) {
            this.isPenUp = false;
        }
    },

    color(c) {
        this.penColor = c;
        this.draw();
    },

    get theta() {
        return (this.heading - 90) * Math.PI / 180;
    }
}

console.log(vm.add(First(
    Seq(
        Effect(() => { Turtle.pendown(); }),
        Repeat(Seq(
            Turtle.forward(100),
            Turtle.right(90),
            Turtle.forward(100),
            Turtle.right(90),
            Turtle.forward(50),
            Turtle.right(90),
            Turtle.forward(50),
            Turtle.right(90),
            Turtle.forward(100),
            Turtle.right(90),
            Turtle.forward(25),
            Turtle.right(90),
            Turtle.forward(25),
            Turtle.right(90),
            Turtle.forward(100)
        ))
    ),
    Ramp((_, p, t) => { Turtle.draw(); })
)).dump());
