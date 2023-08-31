import { svg } from "../lib/util.js";
import { Tape } from "../lib/tape.js";
import { Deck } from "../lib/deck.js";
import { Effect, Instant, Ramp, Repeat, Score, Seq } from "../lib/timing.js";
import { TransportBar } from "../lib/gui/transport-bar.js";

const tape = Tape();
const deck = Deck({ tape });
const score = Score({ tape });

const transportBar = TransportBar(score);
document.body.insertBefore(transportBar.element(), document.body.firstChild);

const N = 15;
const dur = 4000;

const arcs = document.querySelector("g.arcs");
const balls = document.querySelector("g.balls");
for (let i = 0; i < N; ++i) {
    const r = (i + 1) * 4;
    arcs.appendChild(svg("path", {
        d: `M ${r + 64},128 A ${r},${r} 180 0,0 ${64 - r},128`,
        stroke: `hsl(${(r - 4) * 6}deg, 100%, 50%)`
    }));
    const ball = balls.appendChild(svg("circle", { cx: r + 64, cy: 128, r: 2 }));
    score.add(Repeat(Ramp(
        Effect(p => {
            const angle = 2 * (p > 0.5 ? 1 - p : p) * Math.PI;
            ball.setAttribute("cx", 64 + r * Math.cos(angle));
            ball.setAttribute("cy", 128 - r * Math.sin(angle));
        })).dur(dur * (1 + i / (5 * N)))))
}

