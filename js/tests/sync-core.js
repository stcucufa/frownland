import { test } from "./test.js";
import { K } from "../lib/util.js";
import { Instant, Delay, Par, Seq, dump } from "../lib/score.js";
import { Tape } from "../lib/tape.js";
import { Deck } from "../lib/deck.js";

test("Instant(f)", t => {
    const tape = Tape();
    const instant = Instant(K("ok"));
    const instance = tape.instantiate(instant, 17);
    t.equal(instance.tape, tape, "instance.tape is set");
    t.equal(instance.item, instant, "instance.item is set");
    t.equal(instance.t, 17, "instance.t is set");

    Deck({ tape }).now = 18;
    t.equal(instance.value, "ok", "instance value");
});

test("Instant(f).repeat().take(n); n finite", t => {
    const tape = Tape();
    const repeat = tape.instantiate(Instant(K("ok")).repeat().take(3), 17);
    Deck({ tape }).now = 18;
    t.equal(dump(repeat),
`* Seq/repeat-0 @17 <ok>
  * Instant-1 @17 <ok>
  * Instant-2 @17 <ok>
  * Instant-3 @17 <ok>`, "dump matches");
});

test("Instant(f).repeat().take() failure", t => {
    const tape = Tape();
    const repeat = tape.instantiate(Instant(K("ok")).repeat(), 17);
    t.undefined(repeat, "Instantiation failure");
});

test("Delay(d)", t => {
    const tape = Tape();
    const delay = Delay(23);
    const instance = tape.instantiate(delay, 17);
    t.equal(instance.tape, tape, "instance.tape is set");
    t.equal(instance.item, delay, "instance.item is set");
    t.equal(instance.begin, 17, "instance.begin is set");
    t.equal(instance.end, 40, "instance.end is set");

    Deck({ tape }).now = 41;
    t.equal(Object.hasOwn(instance, "value"), true, "instance value");
});

test("Delay(d) fails if d ≤ 0", t => {
    const tape = Tape();
    t.undefined(tape.instantiate(Delay(-23), 17), "negative delay");
    t.undefined(tape.instantiate(Delay(0), 17), "zero duration delay");
});

test("Delay(d).repeat()", t => {
    const tape = Tape();
    const repeat = tape.instantiate(Delay(23).repeat(), 17);
    Deck({ tape }).now = 111;
    t.equal(dump(repeat),
`* Seq/repeat-0 [17, ∞[
  * Delay-1 [17, 40[ <undefined>
  * Delay-2 [40, 63[ <undefined>
  * Delay-3 [63, 86[ <undefined>
  * Delay-4 [86, 109[ <undefined>
  * Delay-5 [109, 132[`, "dump matches");
});

test("Delay(d).repeat().take(n)", t => {
    const tape = Tape();
    const repeat = tape.instantiate(Delay(23).repeat().take(3), 17);
    Deck({ tape }).now = 87;
    t.equal(dump(repeat),
`* Seq/repeat-0 [17, 86[ <undefined>
  * Delay-1 [17, 40[ <undefined>
  * Delay-2 [40, 63[ <undefined>
  * Delay-3 [63, 86[ <undefined>`, "dump matches");
});

test("Par(xs)", t => {
    const tape = Tape();
    const instant = Instant();
    const delay1 = Delay(23);
    const delay2 = Delay(19);
    const par = Par([instant, delay1, delay2]);
    const instance = tape.instantiate(par, 17);
    t.equal(instance.tape, tape, "instance.tape is set");
    t.equal(instance.item, par, "instance.item is set");
    t.equal(instance.begin, 17, "instance.begin is set");
    t.equal(instance.end, 40, "instance.end is set");
    t.equal(instance.children.map(
        instance => instance.item
    ), [instant, delay1, delay2], "instance children");
    t.equal(instance.children.map(
        instance => instance.begin ?? instance.t
    ), [17, 17, 17], "instance children begin");
    t.equal(instance.children.map(
        instance => instance.end ?? instance.t
    ), [17, 40, 36], "instance children end");
    t.equal(instance.children[0].parent, instance, "instance children parent");
    t.equal(instance.children[1].parent, instance, "instance children parent (2)");
    t.equal(instance.children[2].parent, instance, "instance children parent (3)");

    Deck({ tape }).now = 41;
    t.equal(instance.value, [undefined, undefined, undefined], "instance value");
});

test("Par(xs); zero duration", t => {
    const tape = Tape();
    const par = Par([Instant(), Instant(), Instant()]);
    const instance = tape.instantiate(par, 17);
    t.equal(instance.t, 17, "instance.t is set");

    Deck({ tape }).now = 18;
    t.equal(instance.value, [undefined, undefined, undefined], "instance value");
});

test("Par()", t => {
    const tape = Tape();
    const par = Par();
    const instance = tape.instantiate(par, 17);
    t.equal(instance.item, par, "instance.item is set");
    t.equal(instance.t, 17, "instance.t is set");
    t.equal(instance.children, [], "no children for instance");

    Deck({ tape }).now = 18;
    t.equal(instance.value, [], "value for empty par");
});

test("Par value", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([
        Seq([Instant(K("A")), Delay(23)]),
        Instant(K("B")),
        Seq([Instant(K("C")), Delay(23)]),
        Seq([Instant(K("D")), Delay(19)]),
    ]), 17);

    Deck({ tape }).now = 49;
    t.equal(par.value, ["A", "B", "C", "D"], "static value");
});

test("Par(xs); failure during instantiation", t => {
    const tape = Tape();
    t.undefined(tape.instantiate(Par([
        Instant(() => { throw Error("should be pruned"); }),
        Instant().repeat(),
        Instant(() => { throw Error("should not be intantiated"); })
    ]), 17), "failed to instantiate par");
    t.equal(tape.occurrences.length, 0, "no occurrences on tape");
});

test("Par(xs); allowing failure during instantiation", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([
        Delay(23),
        Delay(31),
        Delay(-17), // fails
        Delay(19),
        Instant().repeat(), // fails
    ]).take(3), 17);
    t.equal(dump(par),
`* Par-0 [17, 48[
  * Delay-1 [17, 36[
  * Delay-2 [17, 40[
  * Delay-3 [17, 48[`, "dump matches");
});

test("Par(xs).take(n = ∞)", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([
        Seq([Instant(K("A")), Delay(23)]),
        Instant(K("B")),
        Seq([Instant(K("C")), Delay(23)]),
        Seq([Instant(K("D")), Delay(19)]),
    ]).take(), 17);

    Deck({ tape }).now = 49;
    t.equal(par.value, ["B", "D", "A", "C"], "dynamic value");
});

test("Par(xs).take(n); fails when n > xs.length", t => {
    const tape = Tape();
    t.undefined(tape.instantiate(Par([
        Seq([Instant(K("A")), Delay(23)]),
        Instant(K("B")),
        Seq([Instant(K("C")), Delay(23)]),
        Seq([Instant(K("D")), Delay(19)]),
    ]).take(7), 17), "not enough children");
});

test("Par(xs).take(n); n < xs.length", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([
        Seq([Instant(K("A")), Delay(23), Instant(x => x + "*")]),
        Instant(K("B")),
        Seq([Instant(K("C")), Delay(23), Instant(x => x + "*")]),
        Seq([Instant(K("D")), Delay(19), Instant(x => x + "*")]),
    ]).take(1), 17);

    Deck({ tape }).now = 49;
    t.equal(par.value, ["B"], "dynamic value");
    t.equal(dump(par), 
`* Par-0 @17 <B>
  * Instant-1 @17 <B>`, "dump matches");
});

test("Par(xs).take(0)", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([
        Seq([Instant(K("A")), Delay(23)]),
        Instant(K("B*")),
        Seq([Instant(K("C")), Delay(23)]),
        Seq([Instant(K("D")), Delay(19)]),
    ]).take(0), 17);

    Deck({ tape }).now = 18;
    t.equal(par.value, [], "dynamic value");
    t.equal(dump(par), "* Par-0 @17 <>", "dump matches");
});

test("Par(xs).repeat()", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([Instant(K("A")), Delay(23)]).repeat(), 17);

    Deck({ tape }).now = 71;
    t.equal(dump(par), 
`* Seq/repeat-0 [17, ∞[
  * Par-1 [17, 40[ <A,>
    * Instant-2 @17 <A>
    * Delay-3 [17, 40[ <undefined>
  * Par-4 [40, 63[ <A,>
    * Instant-5 @40 <A>
    * Delay-6 [40, 63[ <undefined>
  * Par-7 [63, 86[
    * Instant-8 @63 <A>
    * Delay-9 [63, 86[`, "dump matches");
});

test("Par(xs).repeat().take(n)", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([Delay(23), Delay(19)]).repeat().take(3), 17);
    Deck({ tape }).now = 87;
    t.equal(dump(par),
`* Seq/repeat-0 [17, 86[ <,>
  * Par-1 [17, 40[ <,>
    * Delay-2 [17, 40[ <undefined>
    * Delay-3 [17, 36[ <undefined>
  * Par-4 [40, 63[ <,>
    * Delay-5 [40, 63[ <undefined>
    * Delay-6 [40, 59[ <undefined>
  * Par-7 [63, 86[ <,>
    * Delay-8 [63, 86[ <undefined>
    * Delay-9 [63, 82[ <undefined>`, "dump matches");
});

test("Par(xs).repeat().take(n); zero-duration par", t => {
    const tape = Tape();
    const par = tape.instantiate(Par([Instant(K("A")), Instant(K(1))]).repeat().take(3), 17);

    Deck({ tape }).now = 18;
    t.equal(dump(par), 
`* Seq/repeat-0 @17 <A,1>
  * Par-1 @17 <A,1>
    * Instant-2 @17 <A>
    * Instant-3 @17 <1>
  * Par-4 @17 <A,1>
    * Instant-5 @17 <A>
    * Instant-6 @17 <1>
  * Par-7 @17 <A,1>
    * Instant-8 @17 <A>
    * Instant-9 @17 <1>`, "dump matches");
});

test("Par.map(g)", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 37, 31])),
        Par.map(Delay),
        Instant(xs => xs.length)
    ]), 17);

    Deck({ tape }).now = 55;
    t.equal(dump(instance),
`* Seq-0 [17, 54[ <3>
  * Instant-1 @17 <19,37,31>
  * Par/map-2 [17, 54[ <19,37,31>
    * Delay-3 [17, 36[ <19>
    * Delay-4 [17, 54[ <37>
    * Delay-5 [17, 48[ <31>
  * Instant-6 @54 <3>`, "dump matches");
});

test("Par.map(g), empty input array", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([])),
        Par.map(Delay)
    ]), 17);

    Deck({ tape }).now = 18;
    t.equal(instance.value, [], "empty list");
});

test("Par.map(g).take(n = ∞)", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 37, 31, 19, 51])),
        Par.map((x, i) => Par([Instant(K(i)), Delay(x)])).take(),
        Instant(xs => xs.map(([i]) => i))
    ]), 17);

    Deck({ tape }).now = 69;
    t.equal(instance.value, [0, 3, 2, 1, 4], "value");
});

test("Par.map(g).take(n); fails at runtime when n > input length", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 37, 31, 19, 51])),
        Par.map((x, i) => Par([Instant(K(i)), Delay(x)])).take(7),
        Instant(xs => xs.map(([i]) => i))
    ]), 17);

    Deck({ tape }).now = 18;
    t.equal(instance.failed, true, "failed to instantiate map");
});

test("Par.map(g).take(n); n < input length", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 37, 31, 19, 51])),
        Par.map(x => Par([Instant(K(x)), Delay(x)])).take(3),
        Instant(xs => xs.map(([i]) => i))
    ]), 17);

    Deck({ tape }).now = 69;
    t.equal(instance.value, [19, 19, 31], "value");
});

test("Par.map(g).take(0)", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 37, 31, 19, 51])),
        Par.map((x, i) => Par([Instant(K(i)), Delay(x)])).take(0)
    ]), 17);

    Deck({ tape }).now = 18;
    t.equal(instance.value, [], "empty list");
});

test("Par.map(g) failure", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K("oops")),
        Par.map(Delay)
    ]), 17);

    Deck({ tape }).now = 18;
    t.equal(dump(instance),
`* Seq-0 @17 (failed)
  * Instant-1 @17 <oops>
  * Par/map-2 @17 (failed)`, "dump matches");
});

test("Par.map(g).repeat()", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 23])),
        Par.map(Delay).repeat()
    ]), 17);
    Deck({ tape }).now = 69;
    t.equal(dump(instance),
`* Seq-0 [17, ∞[
  * Instant-1 @17 <19,23>
  * Seq/repeat-2 [17, ∞[
    * Par/map-3 [17, 40[ <19,23>
      * Delay-4 [17, 36[ <19>
      * Delay-5 [17, 40[ <23>
    * Par/map-6 [40, 63[ <19,23>
      * Delay-7 [40, 59[ <19>
      * Delay-8 [40, 63[ <23>
    * Par/map-9 [63, 86[
      * Delay-10 [63, 82[
      * Delay-11 [63, 86[`, "dump matches");
});

test("Par.map(g).repeat().take(n)", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([19, 23])),
        Par.map(Delay).repeat().take(3)
    ]), 17);
    Deck({ tape }).now = 87;
    t.equal(dump(instance),
`* Seq-0 [17, 86[ <19,23>
  * Instant-1 @17 <19,23>
  * Seq/repeat-2 [17, 86[ <19,23>
    * Par/map-3 [17, 40[ <19,23>
      * Delay-4 [17, 36[ <19>
      * Delay-5 [17, 40[ <23>
    * Par/map-6 [40, 63[ <19,23>
      * Delay-7 [40, 59[ <19>
      * Delay-8 [40, 63[ <23>
    * Par/map-9 [63, 86[ <19,23>
      * Delay-10 [63, 82[ <19>
      * Delay-11 [63, 86[ <23>`, "dump matches");
});

test("Par may recover from failing child", t => {
    const tape = Tape();
    const instance = tape.instantiate(Seq([
        Instant(K([23, 19])),
        Par([
            Par.map(x => Delay(-x)),
            Par.map(Delay)
        ]).take(1)
    ]), 17)

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <23,19>
  * Instant-1 @17 <23,19>
  * Par-2 [17, 40[ <23,19>
    * Par/map-4 [17, 40[ <23,19>
      * Delay-7 [17, 40[ <23>
      * Delay-8 [17, 36[ <19>`, "dump matches");
});

test("Seq(xs)", t => {
    const tape = Tape();
    const instant = Instant();
    const delay1 = Delay(23);
    const delay2 = Delay(19);
    const seq = Seq([instant, delay1, delay2]);
    const instance = tape.instantiate(seq, 17);
    t.equal(instance.tape, tape, "instance.tape is set");
    t.equal(instance.item, seq, "instance.item is set");
    t.equal(instance.begin, 17, "instance.begin is set");
    t.equal(instance.end, 59, "instance.end is set");
    t.equal(instance.children.map(
        instance => instance.item
    ), [instant, delay1, delay2], "instance children");
    t.equal(instance.children.map(
        instance => instance.begin ?? instance.t
    ), [17, 17, 40], "instance children begin");
    t.equal(instance.children.map(
        instance => instance.end ?? instance.t
    ), [17, 40, 59], "instance children end");
    t.equal(instance.children[0].parent, instance, "instance children parent");
    t.equal(instance.children[1].parent, instance, "instance children parent (2)");
    t.equal(instance.children[2].parent, instance, "instance children parent (3)");

    Deck({ tape }).now = 60;
    t.equal(Object.hasOwn(instance, "value"), true, "value for seq");
});

test("Seq()", t => {
    const tape = Tape();
    const seq = Seq();
    const instance = tape.instantiate(seq, 17);
    t.equal(instance.item, seq, "instance.item is set");
    t.equal(instance.t, 17, "instance.t is set");
    t.equal(instance.children, [], "no children for instance");

    Deck({ tape }).now = 18;
    t.equal(Object.hasOwn(instance, "value"), true, "value for seq");
});

test("Seq(xs); zero duration", t => {
    const tape = Tape();
    const seq = Seq([Instant(), Instant(), Instant()]);
    const instance = tape.instantiate(seq, 17);
    t.equal(instance.t, 17, "instance.t is set");

    Deck({ tape }).now = 18;
    t.equal(Object.hasOwn(instance, "value"), true, "value for seq");
});

test("Seq(xs); child with infinite duration", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(), Instant(), Delay(23).repeat(), Delay(-31)]), 17);
    Deck({ tape }).now = 18;
    t.equal(dump(seq),
`* Seq-0 [17, ∞[
  * Instant-1 @17 <undefined>
  * Instant-2 @17 <undefined>
  * Seq/repeat-3 [17, ∞[
    * Delay-4 [17, 40[`, "dump matches");
});

test("Seq(xs); child with unresolved duration", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([23])), Par.map(Delay), Instant()]), 17);
    Deck({ tape }).now = 41;
    t.equal(dump(seq),
`* Seq-0 [17, 40[ <23>
  * Instant-1 @17 <23>
  * Par/map-2 [17, 40[ <23>
    * Delay-3 [17, 40[ <23>
  * Instant-4 @40 <23>`, "dump matches");
});

test("Seq(xs); child with unresolved duration; failure once the end is resolved", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([23])), Par.map(Delay), Instant(), Delay(-31)]), 17);
    Deck({ tape }).now = 41;
    t.equal(dump(seq),
`* Seq-0 [17, 40[ (failed)
  * Instant-1 @17 <23>
  * Par/map-2 [17, 40[ <23>
    * Delay-3 [17, 40[ <23>`, "dump matches");
});

test("Seq(xs).take(n = ∞)", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K("ok")), Delay(23), Delay(19)]).take(), 17);
    Deck({ tape }).now = 60;
    t.equal(dump(seq),
`* Seq-0 [17, 59[ <ok>
  * Instant-1 @17 <ok>
  * Delay-2 [17, 40[ <ok>
  * Delay-3 [40, 59[ <ok>`, "dump matches");
});

test("Seq(xs).take(n); n > xs.length", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K("ok")), Delay(23), Delay(19)]).take(7), 17);
    Deck({ tape }).now = 60;
    t.equal(dump(seq),
`* Seq-0 [17, 59[ <ok>
  * Instant-1 @17 <ok>
  * Delay-2 [17, 40[ <ok>
  * Delay-3 [40, 59[ <ok>`, "dump matches");
});

test("Seq(xs).take(n); n < xs.length", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K("ok")), Delay(23), Instant(K("nope"))]).take(2), 17);
    Deck({ tape }).now = 41;
    t.equal(dump(seq),
`* Seq-0 [17, 40[ <ok>
  * Instant-1 @17 <ok>
  * Delay-2 [17, 40[ <ok>`, "dump matches");
});

test("Seq(xs).take(0)", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K("nope")), Delay(23), Delay(19)]).take(0), 17);
    Deck({ tape }).now = 18;
    t.equal(dump(seq), "* Seq-0 @17 <undefined>", "dump matches");
});

test("Seq(xs).repeat()", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([
        Instant(K(1)),
        Seq([Instant(x => x * 2), Delay(23)]).repeat()
    ]), 17);
    Deck({ tape }).now = 110;
    t.equal(dump(seq),
`* Seq-0 [17, ∞[
  * Instant-1 @17 <1>
  * Seq/repeat-2 [17, ∞[
    * Seq-3 [17, 40[ <2>
      * Instant-4 @17 <2>
      * Delay-5 [17, 40[ <2>
    * Seq-6 [40, 63[ <4>
      * Instant-7 @40 <4>
      * Delay-8 [40, 63[ <4>
    * Seq-9 [63, 86[ <8>
      * Instant-10 @63 <8>
      * Delay-11 [63, 86[ <8>
    * Seq-12 [86, 109[ <16>
      * Instant-13 @86 <16>
      * Delay-14 [86, 109[ <16>
    * Seq-15 [109, 132[
      * Instant-16 @109 <32>
      * Delay-17 [109, 132[`, "dump matches");
});

test("Seq(xs).repeat().take(n)", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([
        Instant(K(1)),
        Seq([Instant(x => x * 2), Delay(23)]).repeat().take(4)
    ]), 17);
    Deck({ tape }).now = 110;
    t.equal(seq.value, 16, "return value");
});

test("Seq(xs); failure during instantiation", t => {
    const tape = Tape();
    t.undefined(tape.instantiate(Seq([
        Instant(() => { throw Error("should be pruned"); }),
        Instant().repeat(),
        Instant(() => { throw Error("should not be intantiated"); })
    ]), 17), "failed to instantiate seq");
    t.equal(tape.occurrences.length, 0, "no occurrences on tape");
});

test("Seq(xs).take(n); failure in child before nth", t => {
    const tape = Tape();
    t.undefined(tape.instantiate(Seq([
        Instant(() => { throw Error("should be pruned"); }),
        Instant().repeat(),
        Instant(() => { throw Error("should not be intantiated"); }),
        Instant(() => { throw Error("should not be intantiated"); }),
        Instant(() => { throw Error("should not be intantiated"); })
    ]).take(3), 17), "failed to instantiate seq");
    t.equal(tape.occurrences.length, 0, "no occurrences on tape");
});

test("Seq(xs).take(n); failure in child after nth", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([
        Instant(K("ok")),
        Instant(),
        Instant(),
        Instant().repeat(),
        Instant(() => { throw Error("should not be intantiated"); })
    ]).take(3), 17);
    Deck({ tape }).now = 18;
    t.equal(seq.value, "ok", "correct value");
});

test("Seq.map(g)", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([31, 19, 23])), Seq.map(Delay)]), 17);
    Deck({ tape }).now = 91;
    t.equal(dump(seq),
`* Seq-0 [17, 90[ <31,19,23>
  * Instant-1 @17 <31,19,23>
  * Seq/map-2 [17, 90[ <31,19,23>
    * Delay-3 [17, 48[ <31>
    * Delay-4 [48, 67[ <19>
    * Delay-5 [67, 90[ <23>`, "dump matches");
});

test("Seq.map(g); no input", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([])), Seq.map(Delay)]), 17);
    Deck({ tape }).now = 91;
    t.equal(dump(seq),
`* Seq-0 @17 <undefined>
  * Instant-1 @17 <>
  * Seq/map-2 @17 <undefined>`, "dump matches");
});

test("Seq.map(g).repeat()", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([19, 23])), Seq.map(Delay).repeat()]), 17);
    Deck({ tape }).now = 111;
    t.equal(dump(seq),
`* Seq-0 [17, ∞[
  * Instant-1 @17 <19,23>
  * Seq/repeat-2 [17, ∞[
    * Seq/map-3 [17, 59[ <19,23>
      * Delay-4 [17, 36[ <19>
      * Delay-5 [36, 59[ <23>
    * Seq/map-6 [59, 101[ <19,23>
      * Delay-7 [59, 78[ <19>
      * Delay-8 [78, 101[ <23>
    * Seq/map-9 [101, 143[
      * Delay-10 [101, 120[
      * Delay-11 [120, 143[`, "dump matches");
});

test("Seq.map(g).repeat().take(n)", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([19, 23])), Seq.map(Delay).repeat().take(3)]), 17);
    Deck({ tape }).now = 144;
    t.equal(dump(seq),
`* Seq-0 [17, 143[ <19,23>
  * Instant-1 @17 <19,23>
  * Seq/repeat-2 [17, 143[ <19,23>
    * Seq/map-3 [17, 59[ <19,23>
      * Delay-4 [17, 36[ <19>
      * Delay-5 [36, 59[ <23>
    * Seq/map-6 [59, 101[ <19,23>
      * Delay-7 [59, 78[ <19>
      * Delay-8 [78, 101[ <23>
    * Seq/map-9 [101, 143[ <19,23>
      * Delay-10 [101, 120[ <19>
      * Delay-11 [120, 143[ <23>`, "dump matches");
});

test("Seq.fold(g, z); child of Seq", t => {
    const tape = Tape();
    const seq = Seq([Instant(K([1, 2, 3])), Seq.fold(x => Instant(y => x + y), 0)]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 18;
    t.equal(dump(instance),
`* Seq-0 @17 <6>
  * Instant-1 @17 <1,2,3>
  * Seq/fold-2 @17 <6>
    * Instant-3 @17 <1>
    * Instant-4 @17 <3>
    * Instant-5 @17 <6>`, "dump matches");
});

test("Seq.fold(g, z); child of Seq, siblings", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([1, 2, 3])),
        Seq.fold(x => Instant(y => x + y), 0),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <6>
  * Instant-1 @17 <1,2,3>
  * Seq/fold-2 @17 <6>
    * Instant-3 @17 <1>
    * Instant-4 @17 <3>
    * Instant-5 @17 <6>
  * Delay-6 [17, 40[ <6>`, "dump matches");
});

test("Seq.fold(g, z); child of Par", t => {
    const tape = Tape();
    const seq = Seq([Instant(K([1, 2, 3])), Par([Delay(23), Seq.fold(x => Instant(y => x + y), 0)])]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <1,2,3,6>
  * Instant-1 @17 <1,2,3>
  * Par-2 [17, 40[ <1,2,3,6>
    * Delay-3 [17, 40[ <1,2,3>
    * Seq/fold-4 @17 <6>
      * Instant-5 @17 <1>
      * Instant-6 @17 <3>
      * Instant-7 @17 <6>`, "dump matches");
});

test("Seq.fold(g, z); no input", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([])),
        Seq.fold(Delay, 31),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);
    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <31>
  * Instant-1 @17 <>
  * Seq/fold-2 @17 <31>
  * Delay-3 [17, 40[ <31>`, "dump matches");
});

test("Seq.fold(g, z) failure; child of Seq", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K("oops")),
        Seq.fold(x => Instant(y => x + y), 0),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 18;
    t.equal(dump(instance),
`* Seq-0 @17 (failed)
  * Instant-1 @17 <oops>
  * Seq/fold-2 @17 (failed)`, "dump matches");
});

test("Seq.fold(g, z) failure; child of Par", t => {
    const tape = Tape();
    const seq = Seq([Instant(K("oops")), Par([Delay(23), Seq.fold(x => Instant(y => x + y), 0)])]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 @17 (failed)
  * Instant-1 @17 <oops>
  * Par-2 @17 (failed)
    * Delay-3 @17 (cancelled)
    * Seq/fold-4 @17 (failed)`, "dump matches");
});

test("Seq.fold(g, z).repeat(); failure", t => {
    const tape = Tape();
    const seq = Seq([Instant(K([1, 2, 3])), Seq.fold(x => Instant(y => x + y), 0).repeat()]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 18;
    t.equal(dump(instance),
`* Seq-0 @17 (failed)
  * Instant-1 @17 <1,2,3>
  * Seq/repeat-2 @17 (failed)
    * Seq/fold-3 @17 <6>
      * Instant-4 @17 <1>
      * Instant-5 @17 <3>
      * Instant-6 @17 <6>
    * Seq/fold-7 @17 (failed)`, "dump matches");
});

test("Seq.fold(g, z).take(n = ∞)", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([1, 2, 3, 4, 5])),
        Seq.fold(x => Instant(y => x + y), 0).take(),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <15>
  * Instant-1 @17 <1,2,3,4,5>
  * Seq/fold-2 @17 <15>
    * Instant-3 @17 <1>
    * Instant-4 @17 <3>
    * Instant-5 @17 <6>
    * Instant-6 @17 <10>
    * Instant-7 @17 <15>
  * Delay-8 [17, 40[ <15>`, "dump matches");
});

test("Seq.fold(g, z).take; n > child count", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([1, 2, 3, 4, 5])),
        Seq.fold(x => Instant(y => x + y), 0).take(7),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <15>
  * Instant-1 @17 <1,2,3,4,5>
  * Seq/fold-2 @17 <15>
    * Instant-3 @17 <1>
    * Instant-4 @17 <3>
    * Instant-5 @17 <6>
    * Instant-6 @17 <10>
    * Instant-7 @17 <15>
  * Delay-8 [17, 40[ <15>`, "dump matches");
});

test("Seq.fold(g, z).take; n < child count", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([1, 2, 3, 4, 5])),
        Seq.fold(x => Instant(y => x + y), 0).take(3),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);

    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <6>
  * Instant-1 @17 <1,2,3,4,5>
  * Seq/fold-2 @17 <6>
    * Instant-3 @17 <1>
    * Instant-4 @17 <3>
    * Instant-5 @17 <6>
  * Delay-6 [17, 40[ <6>`, "dump matches");
});

test("Seq.fold(g, z).take(0)", t => {
    const tape = Tape();
    const seq = Seq([
        Instant(K([1, 2, 3, 4, 5])),
        Seq.fold(x => Instant(y => x + y), 0).take(0),
        Delay(23)
    ]);
    const instance = tape.instantiate(seq, 17);
    Deck({ tape }).now = 41;
    t.equal(dump(instance),
`* Seq-0 [17, 40[ <0>
  * Instant-1 @17 <1,2,3,4,5>
  * Seq/fold-2 @17 <0>
  * Delay-3 [17, 40[ <0>`, "dump matches");
});

test("Nesting", t => {
    const tape = Tape();
    const par = Par([
        Seq([Delay(31), Instant(K("a"))]),
        Seq([Delay(23), Par([Delay(19), Instant(K("b"))])]),
    ]);
    const instance = tape.instantiate(par, 17);

    const deck = Deck({ tape });
    deck.now = 60;

    t.equal(dump(instance),
`* Par-0 [17, 59[ <a,,b>
  * Seq-1 [17, 48[ <a>
    * Delay-2 [17, 48[ <undefined>
    * Instant-3 @48 <a>
  * Seq-4 [17, 59[ <,b>
    * Delay-5 [17, 40[ <undefined>
    * Par-6 [40, 59[ <,b>
      * Delay-7 [40, 59[ <undefined>
      * Instant-8 @40 <b>`, "dump matches");
});
