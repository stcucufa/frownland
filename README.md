# Frownland

> My SMIL is stuck  
> I cannot go back to your frownland

Frownland is an experimental library for the development of Web applications with rich user interactions.
This is very much a work in progress and this document will evolve to reflect changes in design and
implementation. RIYL [SMIL](https://www.w3.org/AudioVideo/), [synchronous programming
languages](https://en.wikipedia.org/wiki/Synchronous_programming_language), or [Captain
Beefheart](https://www.youtube.com/watch?v=-FhhB9teHqU).

## Goals

Any Web application with a complex enough graphical user interface, such as the display of an interactive
map, a video training or tutorial consisting of several videos with choices and quizzes, or a video game,
has to maintain a large amount of state evolving through time. This state must remain consitent throughout,
or the application will exhibit glitches and bugs. Asynchronicity makes maintaining this consistency
challenging, as the flow of the program becomes scattered through event handlers, callbacks, promises,
and async functions. Moreover, debugging and testing also prove more difficult when an interaction takes
time to complete before its outcome can be evaluated, or can break down completely if the developer
attempts to break in the middle of an event handler to examine the state of the application.

The main thesis behind Frownland is that a lot of these difficulties come from the scattering of state
through the program and the obfuscation of the timing of asynchronous interactions. The proposed solution
is therefore to provide a high-level, explicit, mostly declarative representation of the flow of time and
values in the application that is easier to author, debug and test, hopefully leading to shorter
development time and more robust applications.

The strategy to achieve this goal is to define a timing and synchronization model for all the asynchronous
parts of the application, and a rich API to access this model in practice. This model is strongly
influenced by previous work such as SMIL and the synchronous programming language
[Esterel](https://en.wikipedia.org/wiki/Esterel), and can also be compared to contemporary efforts such as
[Web Animations](https://drafts.csswg.org/web-animations-1/). The timing model consists of a small core of
primitives and modifiers, that can be extended to provide a practical toolkit for the application
developer.

## A Simple Example

As an introduction to the model and its API, consider the following snippet of code (this example is
adapted from the “ABRO” example in Esterel):

```js
Repeat(
    Par(
        Seq(
            Par(Event(A, "click"), Event(B, "click")),
            Set(O, textContent, "on").dur(Infinity)
        ),
        Event(R, "click")
    ).take(1)
)
```

Given an interface with three buttons referred to by the variables `A`, `B`, and `R`, and some text element
`O`, O will display the text “on” when both A and B have been pushed, in any order; pushing R will reset
the state completely (so pushing A then B will show “on”, pushing R will reset the text content; pushing B, B, B, then A will also show “on” until R is pushed; pushing A, R, then B will have no effect until A is
pushed again since R did reset the state).

`Repeat`, `Par`, `Seq`, `Event` and `Set` create items in the timing model and establish a tree structure
(Repeat, Par and Seq being containers, and their arguments describing their children). Starting with the
line:

```js
Par(Event(A, "click"), Event(B, "click"))
```

two items are created to listen to click events on buttons A and B. An `Event` item is a single-use event
listener that waits for the event to occur. A `Par` item creates a container for several items to begin and
run in parallel, ending when all child items have ended. The meaning of this specific Par item is then to
wait for both A and B to be pressed once in any order, all further button presses of one button being
ignored until the other is pressed. Going up,

```js
Seq(Par(...), Set(O, textContent, "on").dur(Infinity)
```

introduces two new items. `Set` sets the value of an attribute or property of an element or object for a
given duration (then reverting to the previous value), as specified by the `dur()` modifier. Here, the
`textContent` property of O is set to “on” for an indefinite amount of time.

Note that this Set is the second child of a `Seq` container, after the Par item described above; items in a
Seq happen in sequence, each child beginning when the preceding sibling ends, the Seq ending when its last
child ends. This means that as soon as both button presses have occurred, the text content of O is set and
stays that way forever since the Set never ends.

We can now introduce the R (reset) button:

```js
Par(Seq(...), Event(R, "click")).take(1)
```

This new Par item means that the Seq that we just described runs in parallel with an event listener for a
click of the R button. Normally, a Par ends when all of its children end, but the `take(1)` modifier
alters this behaviour by allowing the Par to end as soon as one of its children ends, ending all the other
children in turn. Because the Seq never ends, this means that the only way to end this Par is to press the
R button, ending the Seq as well, which has the effect of resetting the text content of O.

This outer Par item describes a single iteration of the system: regardless of whether both A and B have
been pressed, pressing R resets everything to the initial state, and no further interaction would happen,
except that this Par is itself wrapped in a `Repeat` container. Repeat is similar to Seq, except that
it just restarts its child as soon as it ended; meaning that once R has been pressed, the system becomes
operational again and again, repeating forever.

## More complex examples

## Testing

To run the test suite, start a Web server in the frownland repo (_e.g._, `python3 -m http.server 7890`),
then visit [http://localhost:7890/tests/index.html](http://localhost:7890/tests/index.html) in a Web
browser. The test page should give an indication of the current implementation status and also points to
manual tests and demos.
