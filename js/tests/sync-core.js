import { test } from "./test.js";
import { K } from "../lib/util.js";
import { Instant, Delay, Par, Seq, dump } from "../lib/score.js";
import { Tape } from "../lib/tape.js";
import { Deck } from "../lib/deck.js";

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

test("Seq.fold(g, z).take(n); fails at runtime when n > input length", t => {
    const tape = Tape();
    const seq = tape.instantiate(Seq([
        Instant(K([1, 2, 3, 4, 5])),
        Seq.fold(x => Instant(y => x + y), 0).take(7),
        Delay(23)
    ]), 17);
    Deck({ tape }).now = 18;
    t.equal(seq.failed, true, "failed to instantiate map");
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
