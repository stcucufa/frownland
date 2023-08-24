import { isNumber, parseTime, safe } from "../util.js";

export const CancelError = window.Error("cancel");
export const FailureError = window.Error("failed");
export const InputError = window.Error("input");
export const TimeoutError = window.Error("timeout");

// Get the begin/end time of an instance (either an occurrence with t, or an
// interval with begin/end).
export const beginOf = x => x?.begin ?? x?.t;
export const endOf = x => x?.end ?? x?.t;

// When an instance is cancelled, it ends and gets marked as such, erasing
// its occurrence from the tape.
export function cancelled(instance, t) {
    ended(instance, t);
    instance.error = CancelError;
    instance.tape.removeOccurrenceForInstance(instance);
}

// Dump an instance and its children for debugging and testing.
export function dump(instance, withOccurrences = false, indent = "* ") {
    const occurrences = withOccurrences ? instance.tape.occurrences.reduce((is, o, i) => {
        if (o.id === instance.id) {
            is.push(`o${i}@${o.t}`);
        }
        return is;
    }, []) : [];
    const selfDump = `${indent}${instance.id}${
        instance.item.modifiers?.label ? ` "${instance.item.modifiers.label.toString()}"` : ""
    } ${
        Object.hasOwn(instance, "begin") ? `[${instance.begin}, ${
            isFinite(instance.end) ? instance.end : "∞"
        }[` : `@${instance.t}`
    }${
        instance.error === CancelError ? " (cancelled)" :
        instance.error === FailureError ? " (failed)" :
        instance.error === InputError ? " (input error)" :
        instance.error === TimeoutError ? " (timeout)" :
        Object.hasOwn(instance, "error") ? ` error<${instance.error.message ?? instance.error}>` :
        Object.hasOwn(instance, "value") ? ` <${instance.value}>` : ""
    }${occurrences.length > 0 ? ` {${occurrences}}` : ""}`;
    if (!instance.children) {
        return selfDump;
    }
    return [
        selfDump,
        ...instance.children.map(child => dump(child, withOccurrences, `  ${indent}`))
    ].join("\n");
}

// When an instance has ended, its end or t property gets updated and its value
// is optionally stored (note that it may be undefined), in which case the
// parent instance is notified.
export function ended(...args) {
    const [instance, t, value, resolved] = args;
    const endsWithValue = args.length > 2;
    if (Object.hasOwn(instance, "begin")) {
        if (endsWithValue && hasModifier(instance.item, "dur")) {
            // Do not overwrite the end that was already set for normal
            // termination from dur.
            console.assert(t <= instance.end);
        } else if (instance.begin === t) {
            delete instance.begin;
            instance.t = t;
        } else {
            console.assert(t > instance.begin);
            instance.end = t;
        }
    }
    if (endsWithValue) {
        instance.value = value;
        if (resolved) {
            instance.parent?.item.childInstanceEndWasResolved(instance);
        }
        instance.parent?.item.childInstanceDidEnd(instance);
    }
}

// When an instance fails, it ends, store the error that caused the failure in
// the error property and notifies its parent.
export function failed(instance, t, error = FailureError) {
    ended(instance, t);
    instance.error = error;
    instance.parent?.item.childInstanceDidEnd(instance);
}

// Minimum function accepting an undefined value as its second argument, for
// use with take and dur modifiers.
export const min = (x, y) => isNumber(y) ? Math.min(x, y) : x;

// Maximum function accepting an undefined value as its second argument, which
// is considered higher than any definite number (for unresolved durations).
export const max = (x, y) => isNumber(y) ? Math.max(x, y) : x === Infinity ? x : y;

// Generic init function for containers, setting themselves as parent of their
// children.
export function init() {
    for (const child of this.children ?? [this.child]) {
        if (Object.hasOwn(child, "parent")) {
            throw window.Error("Cannot share item between containers");
        }
        child.parent = this;
    }
}

// Same but when there is only one, optional child.
export function initSingleChild() {
    if (this.child) {
        if (Object.hasOwn(this.child, "parent")) {
            throw window.Error("Cannot share item between containers");
        }
        this.child.parent = this;
    }
}

// Get the input parameters for a function; first, the input from the parent,
// then looking for every additional var. Throw if a var reference has no value.
export function inputParameters(instance, t) {
    const input = instance.parent?.item.inputForChildInstance(instance);
    if (instance.item.modifiers?.vars) {
        console.assert(instance.item.modifiers.vars.length > 0);
        const params = [input];
        for (const item of instance.item.modifiers.vars) {
            const i = currentInstance(instance, item, new Set());
            if (!i || beginOf(i) > t) {
                throw window.Error("no value for var");
            }
            params.push(Object.hasOwn(i, "value") ? i.value : i.parent?.item.inputForChildInstance(i));
        }
        return params;
    }
    return input;
}

// Generic forward function for instances, getting the input from the parent
// and storing the value in the instance. Note that `this` is a deck occurrence
// which may wrap the actual instance in case it was created by addInterval.
export function forward(t, interval) {
    const instance = Object.hasOwn(this, "item") ? this : Object.getPrototypeOf(this);
    if (Object.hasOwn(instance, "value")) {
        return;
    }
    try {
        instance.value = instance.item.valueForInstance.call(
            instance, inputParameters(instance, t), t, interval
        );
    } catch (error) {
        instance.error = error;
    }
    instance.parent?.item.childInstanceDidEnd(instance);
}

// Find a current instance for the item starting from an instance that comes
// after it. Look at preceding siblings first, then go to the parent and look
// at it, its children, and its preceding siblings.
function currentInstance(instance, item, visited) {
    if (visited.has(instance)) {
        return;
    }
    visited.add(instance);
    // `item` can be the actual item or its label.
    if (instance.item === item || instance.item.modifiers?.label === item) {
        return instance;
    }
    if (!instance.parent) {
        return;
    }
    // Try preceding siblings.
    const index = instance.parent.children.indexOf(instance);
    console.assert(index >= 0);
    for (let i = index - 1; i >= 0; --i) {
        const j = currentInstance(instance.parent.children[i], item, visited);
        if (j) {
            return j;
        }
    }
    // Try children, then try parent.
    if (instance.children) {
        for (const child of instance.children) {
            const j = currentInstance(child, item, visited);
            if (j) {
                return j;
            }
        }
    }
    return currentInstance(instance.parent, item, visited);
}

// When an instance is pruned, it erases its occurrence from the tape.
export function pruned(instance) {
    delete instance.parent;
    instance.tape.removeOccurrenceForInstance(instance);
}

// Generic show function for items, using their tag and children length.
export function show() {
    return this.children ? `${this.tag}/${this.children.length}` : this.tag;
}

// Modifiers (dur, take) are stored in an optional modifiers object in the item.
export function hasModifier(item, modifier) {
    return item.modifiers && Object.hasOwn(item.modifiers, modifier);
}

// Set a modifier on an item and return it.
export function setModifier(name, value) {
    if (this.modifiers) {
        console.assert(!Object.hasOwn(this.modifiers, name));
    } else {
        this.modifiers = {};
    }
    this.modifiers[name] = value;
    return this;
}

// Set the duration of an item with dur. The duration is a number of
// milliseconds or a time string and must be greater than or equal to zero.
export function dur(duration) {
    if (typeof duration === "string") {
        duration = safe(parseTime)(duration);
    }
    if (isNumber(duration) && duration >= 0) {
        return setModifier.call(this, "dur", duration);
    }
    return this;
}

// Set a label for easy reference in the DAG.
export function label(value) {
    return setModifier.call(this, "label", value);
}

// Set the capacity of an item with take.
export function take(n = Infinity) {
    return setModifier.call(this, "take", isNumber(n) && n >= 0 ? n : 0);
}

// Add a variable reference to a function item (instant, effect, await).
// Note that several vars can be added.
export function varModifier(ref) {
    if (!this.modifiers) {
        this.modifiers = {};
    }
    if (!this.modifiers.vars) {
        this.modifiers.vars = [];
    }
    this.modifiers.vars.push(ref);
    return this;
}
