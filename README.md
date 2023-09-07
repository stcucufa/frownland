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

## A simple example

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
Seq(Par(...), Set(O, textContent, "on").dur(Infinity))
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

The above example illustrates the main point of our approach: the model handles the state of the system for
us, and adding new requirements should not make the complexity explode. While this example could be reduced
to a simple state machine, just requiring an extra button C to be pressed would make the state machine
greatly increase in size, while here it would only require updating the inner Par to:

```js
Par(Event(A, "click"), Event(B, "click"), Event(C, "click"))
```

Likewise, `dur` and `take` modifiers allow tweaking some parameters of the system. Instead of requiring the
user to press the R button after all button presses have been registered, the Set could end on its own
after a duration of 10 seconds:

```js
Seq(Par(...), Set(O, textContent, "on").dur("10s"))
```

We could also introduce a timeout, requiring the user to press the buttons in less than 3 seconds for the
interaction to register:

```js
Par(
    Seq(Par(...), Set(O, textContent, "on").dur("10s")),
    Delay("3s")
).take(1)
```

where `Delay` is an item that does nothing, only ending after the specified duration.

### Rich user interactions

But how would the model apply to a real world application? We will sketch some important features of a
typical Web mapping application. Implementing such an application will be a test of the applicability of
our approach in a complex and useful scenario.

* The map is divided into millions and millions of tiles at different zoom levels (from showing entire
continents to individual buildings) available from remote servers. The client application running in the
browser only shows a few of these tiles at once and stitches them together to display a single map view to
the user.
    * A tile request can be encapsulated in an `Await` item, which wraps an asynchronous function call and
    ends when the call ends.
    * These requests can then be executed concurrently inside a Par, and any action that requires the whole
    map to be displayed can follow within a Seq.
    * Error handling becomes important here as tile requests may fail so a request may need to be retried a
    certain number of times, and a timeout may be necessary to ensure that we don’t wait forever on tiles
    that will never arrive.
* The user should be able to pan the map by dragging the mouse or a finger, zooming by double-clicking or
double-tapping, or select a marker on the map by clicking it or tapping it.
    * A gesture can be represented as a sequence (Seq) of events (Event). A single tap can simply be
    expressed as `Seq(Event(x, "pointerdown"), Event(x, "pointerup"))`, a double tap is the same sequence
    repeated twice (`Repeat(Seq(...)).take(2)`) with a timeout (`Par(Repeat(...), Delay("150ms")`).
    * The same initial event can be the starting point of several gestures happening in parallel, with the
    first gesture to succeed ending and the sequence and cancelling the others
    (`Seq(Event(x, "pointerdown"), Par(...).take(1))`.
* The user should be able to lookup places and locations by querying a search service, returning
coordinates for places to be shown on the map as well as additional information to be displayed in the
graphical user interface (business name, address, opening hours, &c.)
    * Again, a search is a sequence of waiting for a text input event, followed by a service request,
    followed by setting a new location on the map according to the search results. Setting the new location
    can be animated with the `Animate` item, which is similar to set but animates a property over time
    instead of immediately setting it. The appearance of markers on the map to represent the search results
    can also be animated in staggered fashion by introducing a delay of increasing duration before each
    animation.
    * In addition to simple search, an autocomplete service may also be provided. Autocompletion works by
    sending requests and displaying suggestions while the user is typing. It also comes with additional
    challenges: requests should be throttled or debounced to account to account for the speed at which the
    user is typing, and stale suggestions should not replace fresher ones (results may become available out
    of order).

### Multimedia presentations

Since our model deals with time and derives in great part from SMIL, it should be well suited to handle
media with intrinsic duration like audio and video. Consider the case of a video training consisting of a
sequence of text information, videos, and quizzes after a video has played to determine which chapter to
play next. `Video` and `Audio` items can be combined with Par and Seq to provide a playlist, with Event
and Set allowing the addition of interactivity.

Because the model handles most of the state to implement this scenario, this also means that the runtime
can automatically provide useful playback features such as pausing, rewinding, and fast-forwarding, not
just through a single video, but through the whole presentation.

### Other applications

Games: Maybe not the tight loop of physics and graphic updates, but all the logic around it.

Authoring tools: the declarative nature of the model makes it well suited for non-textual editing.

## The model and its runtime

### A directed acyclic graph of items

### A flexible runtime for development and testing

## Risks and Unknowns

## Testing

To run the test suite, start a Web server in the frownland repo (_e.g._, `python3 -m http.server 7890`),
then visit [http://localhost:7890/tests/index.html](http://localhost:7890/tests/index.html) in a Web
browser. The test page should give an indication of the current implementation status and also points to
manual tests and demos.
