# Frownland

> My SMIL is stuck  
> I cannot go back to your frownland

Frownland is an experimental Web framework for the development of rich user interactions. This is very
much a work in progress and this document will evolve to reflect changes in design and implementation.
RIYL [SMIL](https://www.w3.org/AudioVideo/), [synchronous
programming](https://en.wikipedia.org/wiki/Synchronous_programming_language),
[Max](https://cycling74.com/products/max)/[PureData](https://puredata.info), HyperCard, or Captain
Beefheart.

## Frownland in action

This plays a video immediately to the end:

```
Video(src);
```

This plays the video when the user clicks on a play button. The Video element is embedded into a Seq
(sequence) container, and follows an Event element that waits for a click event from an HTML button.

```
Seq(
    Event(playButton, "click"),
    Video(src)
);
```

A more complex example adds a 10s (or 10,000ms) timeout so that the video is skipped if the user does
not click the play button by that time. Here, the combinator `choice` is used twice: two elements are
started, and when one finishes, the other is cancelled and first itself ends. The inner `choice` is used
to either finish after 10s with a `skip` event (this is an internal Frownland event, not a DOM event),
or with the user clicking the play button. The outer `choice` is waiting for a `skip` event, or for the
end of the Seq, which ends when the video to finish playing.

If the user clicks on the play button in less than 10 seconds, then the `skip` event is never sent and
the video will play to the end. On the other hand, if 10 seconds have passed, then a skip event will be
sent and received by Receive element, which causes the Seq, and thus the video playback, to be cancelled.
Note that while interpreting this example is far from obvious, the first goal of the timing model is to
provide a purposely minimal and tight set of semantics, on top of which a more expressive language can be
built. This example should then be expressible more succinctly; `choice` itself is not part of the model,
as will be shown below.

```
choice(
    Receive(skip),
    Seq(
        choice(
            Seq(Delay(10000), Send(skip)),
            Event(playButton, "click")
        ),
        Video(src)
    )
);
```

Another example is [ABRO](http://www1.cs.columbia.edu/~sedwards/classes/2002/w4995-02/esterel.pdf), the
“Hello, world!” of the synchronous programming language [Esterel](https://en.wikipedia.org/wiki/Esterel).
The task is described as follows: ”The output O should occur when inputs A and B have both arrived. The R
input should restart this behavior.” This can be implemented practically with a state machine, but
requiring additional inputs to arrive would make the automaton grow exponentially. In Frownland, as in
Esterel, the solution only grows linearly:

```
choice(
    Seq(
        Par(Receive(A), Receive(B)),
        Send(O),
    ).dur(Infinity),
    Receive(R)
).repeat()
```

Again, `choice()` here allows receiving the event R to reset the system (which keeps running forever thanks
to the `repeat()` modifier). Setting the duration of the sequence that waits for A and B and then sends O
ensures that further A and B events are ignored until R is received. And requiring additional events before
sending O is simply a matter of modifying the Par element, so this can turn into ABCRO with:

```
Par(Receive(A), Receive(B), Receive(C))
```

## Timing and synchronization model

### Synchronous core

Frownland considers only a logical time, separate from the physical time that users actually experience.
In this logical time, pure functions are evaluated instantly (_i.e._, with no time passing) regardless
of their complexity; time only advances when setting _delays_. Functions and delays can be scheduled
using two primitives, `Par` (for _parallel_) and `Seq` (for _sequence_), giving the four basic elements
of the timing model.

* `Instant(f)`: evaluate a pure function _f_ and finishes instantly, without any side effect.
* `Delay(d)`: do nothing and finish after a duration _d_ greater than or equal to zero.
* `Par(xs)`: evaluate a list of elements _xs_ in parallel, finishing when the element with the longest
duration finishes.
* `Seq(xs)`: evaluate a list of elements _xs_ one by one, beginning an element when the previous one
finishes, and finishing with the last one.

These elements can be further modified through the use of the following modifiers:

* `repeat()`: repeats an element indefinitely, producing an inifinite sequence. `x.repeat()` is the same
as `Seq(x, x, ...)`.
* `take(n)` applies to Par, Seq or repeat and finishes when _n_ ≥ 0 child elements have finished, or all
elements by default.
    * `Par(xs).take(n)` selects the _n_ elements from _xs_ that finish first and cancels the rest of the
    elements (cancellation is discussed below).
    * `Par(xs).take()` differs from `Par(xs)` in the output value. In the latter case, output values are
    in the order in which the elements are specified; in the former case, output values are in the order
    in which they finish.
    * `Seq(xs).take(n)` cuts the sequence short by taking only the first n steps. `Seq(xs).take()` is the
    same as just `Seq(xs)`.
    * It is possible to limit the number of occurrences of `repeat()` with `take(n)`:
    `x.repeate().take(3)` is the same as `Seq(x, x, x)`.
* `dur(d)` applies to any item (except Delay), and sets the duration to exactly _d_ ≥ 0. If the natural
duration of the element is less than _d_, then it is padded as if a Delay was added to it. If the natural
duration of the element is more than _d_, then it is cut off earlier and the children that have not
finished yet are pruned.
    * `Instant(f).dur(d)` delays the return value of _f_ by _d_.
    * `Par(xs).dur(d)` sets the duration of the par to _d_ and returns the elements that have finished
    in the order in which they finished.
    * `Seq(xs).dur(d)` sets the duration of the seq to _d_ and returns the last value that finished by _d_.
    * Both `take(n)` and `dur(d)` can apply to an element; if by _d_ less than _n_ child elements have
    finished, then the element fails, otherwise only the first _n_ child elements that have finished are
    returned.
* `Delay.until(t)` is a dynamic variant of `Delay`. Instead of waiting for a set duration, this waits for
the time `t` from the beginning of the parent container (usually a `Seq`, since it behaves like a regular
delay inside a `Par`). If the delay begins _after_ the time _t_, then it has no effect. This is *not*
repeatable since the delay can occur at most once.
* `Par.map(g)` and `Seq.map(g)` map the function _g_ to an input list in parallel or in sequence.
* `Seq.fold(g, z)` folds over an input list with the function _g_ and an initial value _z_ in sequence.

In SMIL, presentations are static in that their content is always the same (the user may influence the
timing of the presentation through events and now be present all of the presentation content, but no new
content is created on the fly); in Frownland, the result of a computation can be used to populate a `Par`
or `Seq` container through `map` and `fold` respectively. For example,

```
Seq.fold(x => Instant(y => x + y), 0)
```

can be used to sum all elements of an input list one by one. Given the input `[1, 2, 3]`, this is
equivalent to

```
Seq(Instant(() => 0), Instant(y => 1 + y), Instant(y => 2 + y), Instant(y => 3 + y))
```

The custom `choice` combinator used in the introduction can be defined as a the following combination
of elements and modifiers:

```
const choice = (x, y) => Seq(Par(x, y).take(1), Instant(([x]) => x));
```

Note that because `Par().take(1)` creates a list of a single value, `Instant(([x] => x))` is used to
unwrap it and produce the value itself.

Cancelling an element means that it and its children are stopped immediately without producing any value.
Note that an `Instant`, or any element with no duration, cannot be cancelled since it finishes as soon
as it starts. Cancelling a `Par` means cancelling all of its children, and cancelling a `Seq` means
cancelling the child being currently evaluated.

It is also possible for an element to be _fallible_, meaning that it cannot begin. An `Instant` fails to
begin if the input value is not valid for its function _f_. `Par` and `Seq` fail if their children fail;
by default, any child failing causes the container to fail, but if the `take(n)` modifier is applied, then
failure can be tolerated as long as enough children can begin (the corollary to this is that a `Par` or
`Seq` can also fail if it does not have enough children for `take()`ing). `Par.map()` or `Seq.fold()`
follow the same rules, but also fail if their input is not a list of values. `repeat()` fails if the
element that it repeats has no duration and it is not constrained to a finite number of iterations through
`take()`.

### Asynchronous layer

The pure, synchronous core on its own is rather useless since it does not allow any input, output, or side
effect. An _asynchronous_ layer is added to the model so that these practical concerns can be addressed,
comprised of three new elements:

* `Effect(f)` is similar to `Instant(f)` but is allowed to produce side effects.
* `Await(f)` evaluates an asynchronous function _f_ and finishes when _f_ finishes, which is _unresolved_
until _f_ is actually evaluated.
* `Event(target, type)` starts listening to an event of a given _type_ from a _target_, and finishes
when an event notification is received.

These elements can be combined with the synchronous elements defined above, and accept the `repeat()`
modifier. The `dur(d)` modified also applies as follows:

* `Effect(f).dur(d)` applies the effect of _f_ after the duration _d_.
* `Await(f).dur(d)` delays the return of _f_ if it ends before the duration _d_, and fails if the call does
not finish by that time.
* `Event(target, type).dur(d)` delays the event value it occurs before the duration _d_, and fails if
the event does not occur by that time.

`Effect` comes with two modifiers of its own and will be detailed when describing the execution
model below:

* `undo(g)` provides an undo function for the effect if it is evaluated again backward;
* `redo(g)` provides a redo function for the effect is it is evaluated again forward.

### Error handling

In addition to failing, an item may end with an error instead of a value. The functions called by Instant,
Effect and Await may throw an exception; if it is not caught, then the item ends with an error. Await and
Event may also end with a timeout error if they do not finish by the duration set explicitly or by the
parent container. Seq.fold, Seq.map and Par.map may end with an input error if their input value is not an
array of values.

An error in a Seq causes the Seq to end as well with an error; in a Par, the problem child is discarded
and the Par *may* recover if enough children end successfully to satisfy a potential take() modifier (but
if there is no modifier, any error will cause the Par to end in error). In order to recover from an error
at runtime, the `Try` item can be used in a similar way to the try/catch construct found in many
programming languages:

* `Try(child, catch)` is a special kind of container (similar to `Par` and `Seq`) that first tries its
regular child. If the child ends with a value, then the `Try` itself ends at the same time with the same
value. But if the child fails, or ends with an error, then the `catch` child is tried with the error as its
input, and the `Try` ends as when the `catch` ends.

### Presentation layer

The presentation layer adds elements for handling views and media in a document, as well as animation
features. The `Video` element of the introduction is a feature of the presentation layer.

Currently, the presentation layer consists of:

* `Element(element, parent, context)`, which adds the DOM element `element` to the `parent` element (or
`document.body` by default) before the `context` element (which defaults to `null`) using the DOM
`insertBefore()` method when the element begins, and removes it when the element ends. By default, the
duration is zero, so nothing happens; `.dur()` can be set to set a duration for the element.

### Synchronous events layer

Synchronous events can be used to extend the timing model, allowing alternate means to begin and end
elements. The core of this layer is a pair of elements, `Send(e)` and `Receive(e)`, which allow custom
events to be sent and received throughout, as show in the introduction example.

## Execution model

The combination of elements and modifiers of the timing model creates a graph of elements that can
then be scheduled and evaluated. Using a musical metaphor, authors create a _score_, organising events
through time. The score can then be realized to a _tape_ through a tape _deck_ that can record
occurrences and play them back at different speeds.

* A `Score` is a kind of `Par` element to which new elements can be added with a time offset. It never
finishes, so that new elements can be added at any time. This also means that a `Score` can be nested
in another `Score`, which will be explored in the future.
    * Items are added to the score with `Score.add(item)`; the begin time of the item is the time at
    which it was added.
    * When an item ends, the tape to which the score was instantiated sends an `end` notification with
    the value of the instance of the item that ended.
    * When an item fails, the tape to which the score was instantiated sends a `fail` notification.
* A `Tape` is used to `instantiate` elements from a score; because of repetition, the same element may have more than one occurrences at different times. An instance can be an instant at a given time, or an interval
with a begin and end time.
* A `Deck` is used to record and play a tape. It is where the conversion between physical and logical time
happens. In record mode, new user inputs can happen; when the user clicks a button at physical time _t_,
this time gets converted to the logical time _t’_ of the score, based on when recording started and at what
speed the tape is rolling. In playback mode, the tape can be rewound and fast-forwarded, and occurrences
that were committed to the tape are played again, using the undo/redo actions of `Effect` when applicable.

## Testing

To run the test suite, start a Web server in the frownland repo (_e.g._, with
`python3 -m http.server 7890`), then visit
[http://localhost:7890/tests/index.html](http://localhost:78910/tests/index.html).
The test page should give an indication of the current implementation status.

## Applications

The first goal of Frownland is to provide a framework for writing Web applications with rich user
interfaces (using animations, gestures, and handling remote data). The current prototype for this framework
is a work in progress.

A further goal is to leverage the declarative nature of the language to build more tools for development
with the framework (such as a test runner and debugging tools to examine timelines of applications using
the timing model), but more importantly a more comprehensive authoring tool. It currently takes the shape
of a patcher prototype; to run it, start a server (as above) and visit
[http://localhost:7890/patcher/](http://localhost:7890/patcher/).
