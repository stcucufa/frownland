import { test } from "./test.js";
import { K } from "../lib/util.js";
import { Instant, Delay, Par, Seq, dump } from "../lib/score.js";
import { Tape } from "../lib/tape.js";
import { Deck } from "../lib/deck.js";

test("Seq value", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K("ok")), Delay(23)]), 17);
    Deck({ tape }).now = 41;
    t.equal(seq.value, "ok", "Seq value");
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
    t.equal(seq.value, [], "empty list");
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

test("Repeat with unresolved duration", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([Instant(K([19, 23])), Seq.map(Delay)]).repeat(), 17);
    Deck({ tape }).now = 111;
    console.log(dump(seq));
    t.equal(dump(seq),
`* Seq/repeat-0 [17, ∞[
  * Seq-1 [17, 59[ <19,23>
    * Instant-2 @17 <19,23>
    * Seq/map-3 [17, 59[ <19,23>
      * Delay-4 [17, 36[ <19>
      * Delay-5 [36, 59[ <23>
  * Seq-6 [59, 101[ <19,23>
    * Instant-7 @59 <19,23>
    * Seq/map-8 [59, 101[ <19,23>
      * Delay-9 [59, 78[ <19>
      * Delay-10 [78, 101[ <23>
  * Seq-11 [101, 143[
    * Instant-12 @101 <19,23>
    * Seq/map-13 [101, 143[
      * Delay-14 [101, 120[
      * Delay-15 [120, 143[`, "dump matches");
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
