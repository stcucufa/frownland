> My SMIL is stuck  
> I cannot go back to your frownland

Frownland is an experimental library for the development of Web applications with rich user interactions.
This is very much a work in progress and this document will evolve to reflect changes in design and
implementation. RIYL [SMIL](https://www.w3.org/AudioVideo/), [synchronous programming
languages](https://en.wikipedia.org/wiki/Synchronous_programming_language), or [Captain
Beefheart](https://www.youtube.com/watch?v=-FhhB9teHqU).

## A timing and synchronization model for the Web

The main question that Frownland is trying to address is the representation of time and data flow in a
program. When using programming language features and Web APIs such as event handlers, promises,
async/await, CSS animations and transitions, or HTML video and audio elements, _synchronization_ quickly
becomes an issue. For example, managing user interactions like dragging or double clicking requires
tracking several possible pointer events, and at what time they occur; several independent event handlers
are required, and some ad hoc state management mechanism (_e.g._, a state machine) needs to be introduced.

There are some synchronization mechanisms for async functions and promises (_e.g._, the `await` keyword,
or `Promise.all`), but even moderately complex usages are challenging to test and debug. Debuggers are
ill-equipped to follow a thread of execution through time rather than through conventional control flow,
and (again) ad hoc management is necessary to be able to make useful test assertions about the state of
the system at arbitrary points in time. Not to mention issues about exactly when and in what order
promises resolve or async function calls finish, or the need to fiddle with the system clock to make tests
run faster than real-time, or to slow down animations to tweak them during development.

The proposed answer is a high-level, declarative, and explicit representation of time and data flow
through a model built on simple and composable primitives providing clear semantics, and an efficient and
flexible execution model supporting the development, testing and debugging of the timing aspects of
complex Web applications.

### In a nutshell

The model is based on primitive items for computation (transforming an input value into an output value),
waiting (letting time pass), and synchronization:

* `Instant(f)` and `Await(f)` are primitives for function calls that end instantly or after some amount of
time;
* `Delay(d)` and `Event(target, type)` are primitives to wait for a specific amout of time to pass or for
an event to occur;
* `Par(x, y, ...)` begins _x_, _y_, ... at the same instant and ends when all items have ended (so they run
in parallel);
* `Seq(x, y, ...)` begins _x_, then _y_ when _x_ ends, and ends when the last item ends;
* `Repeat(x)` begins _x_, then _x_ again when it ends, and so on, forever.

While containers (Par, Seq and Repeat) seem to introduce a tree structure, the same item can be referenced
more than once, which allows the description of a directed graph. Cycles are not allowed, so the graph is
acyclic (but Repeat allows repetition without the need for cycles).

Additionally, *modifiers* allow controlling how long an item can actually run:

* `dur()` sets the duration of the item, cutting it off or timing out when setting a duration shorter than
the natural duration of the item, or extending if further;
* `take()` sets the duration of a container by limiting the number of iterations (for Repeat) or items
(for Par), and ending when the expected number of items have ended.

The execution model is based on a scheduler and a clock that maps the physical time that the user and the
browser perceive to the logical time of the graph. Every discrete clock tick defines an interval of time
(from the time of the last tick to the current time), and all computations that have a logical time that
resolves to a physical time in this interval are executed in logical time order.

### Example

A simple example is [ABRO](http://www1.cs.columbia.edu/~sedwards/classes/2002/w4995-02/esterel.pdf),
adapted from the “Hello, world!” example of the synchronous programming language
[Esterel](https://en.wikipedia.org/wiki/Esterel). The task is described as follows: ”The output O should
occur when inputs A and B have both arrived. The R input should restart this behavior.” Here, the inputs
are button elements (`A`, `B`, `R`) and `O` is a span element that is highlighted when A and B have arrived
by setting its class to `on`.

```javascript
VM().start().add(
    Repeat(
        Seq(
            First(
                Seq(
                    Par(
                        Event(A, "click"),
                        Event(B, "click")
                    ),
                    () => { O.classList.add("on"); }
                ).dur("∞"),
                Event(R, "click")
            ),
            () => { O.classList.remove("on"); },
        )
    )
);
```

`VM().start()` initializes and starts the execution model; `.add()` adds an item to be run. Reading it
inside out, we can see a Par that waits for two click events to be recognized on buttons A and B; the order
is not important. Because that Par is in a Seq, when _both_ events have occurred, the following function is
executed instantly and the O element gets highlighted (a synchronous function is automatically wrapped into
an `Instant` item, while an asynchronous function is wrapped into an `Await` item). This Seq is extended
with a dur() modifier to run forever, but because it is inside a First, we also expect R to be clicked at
some point (`First(x, y)` being similar to `Par(x, y).take(1)`). Doing so ends the First, so the class of
O is reset instantly, and both the outermost Seq and the Repeat at the top level end, starting the
outermost Seq again, and waiting for the buttons to be pressed.

This example can easily be extended: a new C button can be simply added to the innermost Par to turn this
example into ABCRO; the system could reset automatically after some amount of time by changing duration of
the Seq and/or the R event to finite amounts of time.

## Goals

The main goals of Frownland, broadly speaking are:

* Simplifying the development of complex user interactions and the synchronization of multiple asynchronous
processes.
* Testing by querying the state of the system at arbitrary points in time. Having deterministic timing
means that tests can be very specific (_e.g._, at time _t_, _A_ and _B_ must have occurred, in that order,
 and _C_ should be in progress but not finished yet), and using a logical time means that tests do not have
 to run in real time.
* Debugging with time manipulation: going forward and backward, faster or slower than real time.
* Displaying the _timeline_ of the application graphically, so that past and future occurrences can be
inspected during development, testing and debugging to better understand the behaviour of the application.

Applications that could benefit include:

* end-user applications (_e.g._, a slippy map application requires the synchronization of many
asynchronous APIs: geolocation of the user; fetching map data from a tile server; panning, zooming and
even rotating the map with buttons, mouse or finger gestures; animating the addition of marker annotations
on the map or changing the displayed area; searching for places; &c.);
* multimedia presentations (_e.g._, a video training with different chapters and quizzes, or an audio
playlist);
* games (if the execution model can be made efficient enough).

Finally, the project can grow in different directions.

* Error handling is an important aspect that gets even more complicated when mixed with asynchronicity and
needs to be a core aspect of the solution proposed here.
* Common usage patterns can be extracted into more and more complex items (such as First, which is derived
from Par), and common Web APIs can be wrapped into new items to build a convenient standard library.
* The declarative nature of the model makes it suitable for defining the timing graph visually, making
an approachable interaction design tool for non-programmers.
* The model itself, if successful, can be ported outside of the Web environment, as the basic concepts are
not specific to Web development and could apply in other contexts (_e.g._ for concurrent programming).

## Testing

To run the test suite, start a Web server in the frownland repo (_e.g._, `python3 -m http.server 7890`),
then visit [http://localhost:7890/tests/index.html](http://localhost:7890/tests/index.html) in a Web
browser. The test page should give an indication of the current implementation status.
