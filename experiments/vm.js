import { nop } from "../lib/util.js";

const Instant = {
    schedule(T) {
        const [t, i] = T;
        const ops = this.f.map((op, j) => [[t, i + j], op]);
        ops.push([[t, i + this.f.length]]);
        return ops;
    }
};

const Delay = {
    schedule([t]) {
        console.assert(this.dur > 0);
        return [[[t + this.dur, 0]]];
    }
};

const Seq = {
    schedule(T) {
        const x = this.x.schedule(T);
        const y = this.y.schedule(x.pop()[0]);
        return [...x, ...y];
    }
};

function Tmax(Tx, Ty) {
    const [tx, ix] = Tx;
    const [ty, iy] = Ty;
    return tx === ty ? (ix >= iy ? Tx : Ty) : (tx > ty ? Tx : Ty);
}

const Par = {
    schedule(T) {
        const x = this.x.schedule(T);
        const y = this.y.schedule(T);
        const end = Tmax(x.pop()[0], y.pop()[0]);
        return [[T, x, y], [end]];
    }
};

export const instant = f => Object.assign(Object.create(Instant), { f });
export const delay = dur => Object.assign(Object.create(Delay), { dur });
export const seq = (x, y) => Object.assign(Object.create(Seq), { x, y });
export const par = (x, y) => Object.assign(Object.create(Par), { x, y });

function replace(stack, f) {
    const i = stack.length - 1;
    console.assert(i >= 0);
    stack[i] = f(stack[i], stack);
}

export const Op = {
    constant: x => stack => replace(stack, () => x),
    nop,
    replace: (pattern, replacement) => stack => { replace(stack, x => x.replace(pattern, replacement)); },
};

function exec(stack, ops) {
    let t;
    for (const [T, x, y] of ops) {
        if (y) {
            const [sx] = exec(stack.slice(), x);
            const [sy] = exec(stack.slice(), y);
            const n = stack.length - 1;
            replace(stack, () => [sx[n], sy[n]]);
        } else if (x) {
            console.assert(typeof x === "function");
            x(stack);
        } else if (T) {
            t = T;
        }
    }
    return [stack, t];
}

export const run = program => exec([null], program.schedule([0, 0]));
