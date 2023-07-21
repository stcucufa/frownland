import { assign, create, isNumber, nop } from "../util.js";
import { ended, endOf, failed, init, CancelError, FailureError } from "./util.js";

// Try wraps a child with an error child that gets instantiated with the error
// if the child fails, similar to a try/catch block.
export const Try = assign((child, _catch) => create().call(Try, { child, catch: _catch }), {
    tag: "Try",
    init,

    // Don’t show child count since it is always 2.
    show() {
        return this.tag;
    },

    // Used by init()
    get children() {
        return [this.child, this.catch];
    },

    // Fallible when both children are fallible (since a child failure can be
    // caught).
    get fallible() {
        return this.child.fallible && this.catch.fallible;
    },

    // Instantiate the regular child. If that instantiation fails, then
    // the catch child can be instantiated immediately.
    instantiate(instance, t, dur) {
        instance.begin = t;
        const child = instance.tape.instantiate(this.child, t, dur, instance);
        if (child) {
            instance.children = [child];
            instance.maxEnd = t + dur;
        } else {
            instance.caughtError = FailureError;
            const catchChild = instance.tape.instantiate(this.catch, t, dur, instance);
            if (!catchChild) {
                throw FailureError;
            } else {
                instance.children = [catchChild];
            }
        }
    },

    // The input for the regular child is the input for Try, and the error from
    // that child for catch.
    inputForChildInstance(childInstance) {
        const instance = childInstance.parent;
        console.assert(instance.item === this);
        return instance.caughtError ?? this.parent?.inputForChildInstance(instance);
    },

    // Set end and notify parent on ending (except when cancelled; the parent
    // is already aware).
    instanceDidEnd(instance, t) {
        delete instance.caughtError;
        delete instance.maxEnd;
        const cancelled = instance.error === CancelError;
        if (isNumber(instance.begin)) {
            ended(instance, t);
            if (!cancelled) {
                instance.parent?.item.childInstanceEndWasResolved(instance);
            }
        }
        if (!cancelled) {
            instance.parent?.item.childInstanceDidEnd(instance);
        }
    },

    // End when either child ends normally. If the regular child ends in error,
    // then instantiate catch and wait for it to end. If it still ends in error,
    // then end in error as well.
    childInstanceDidEnd(childInstance) {
        const end = endOf(childInstance);
        const instance = childInstance.parent;
        console.assert(instance.item === this);

        if (childInstance.error) {
            if (childInstance.item === this.child) {
                // There was an error, so try to recover.
                const catchChild = instance.tape.instantiate(
                    this.catch, end, instance.maxEnd - end, instance
                );
                if (catchChild) {
                    instance.caughtError = childInstance.error;
                    instance.children.push(catchChild);
                } else {
                    failed(instance, end, FailureError);
                }
            } else {
                // There was an error that could not be recovered.
                instance.error = childInstance.error;
                this.instanceDidEnd(instance, end);
            }
        } else {
            // No error, or we could recover.
            instance.value = childInstance.value;
            this.instanceDidEnd(instance, end);
        }
    },

    // Deal with child duration when it ends, because we don’t know yet if it
    // has succeeded or not.
    childInstanceEndWasResolved: nop,

    // Cancel the current child instance (which could be either the regular or
    // catch child).
    cancelInstance(instance, t) {
        const currentChild = instance.children.at(-1);
        currentChild.item.cancelInstance(currentChild, t);
        instance.error = CancelError;
        this.instanceDidEnd(instance, t);
    },

    // Pruning should only apply when the child instance is instantiated.
    pruneInstance(instance, t) {
        const currentChild = instance.children.at(-1);
        console.assert(currentChild === instance.children[0]);
        currentChild.item.pruneInstance(currentChild, t);
        delete instance.parent;
    }
});
