import { get } from "./util.js";

const sources = new Map();

// Set up a listener for events from a source of a given type.
export function on(source, type, listener) {
    const listeners = get(sources, source, () => ({}));
    if (!listeners.hasOwnProperty(type)) {
        listeners[type] = new Set();
    }
    listeners[type].add(listener);
    return listener;
}

// Set up a listener for the next event from a source of a given type.
export function once(source, type, listener) {
    return on(source, type, function f(e) {
        off(source, type, f);
        listener(e);
    });
}

// Stop listening to events from a source of a given type.
export const off = (source, type, listener) => {
    sources.get(source)?.[type]?.delete(listener);
};

// Return the promise of a notification.
export const notification = (source, type) => new Promise(resolve => {
    once(source, type, resolve);
});

// Return a promise resolving when p, which gets evaluated at every
// notification, becomes false.
export const notifications = (source, type, p) => new Promise(resolve => {
    on(source, type, function handler(e) {
        if (!p(e)) {
            off(source, type, handler);
            resolve();
        }
    });
});

// Send a synchronous notification.
export function notify(source, type, args = {}) {
    dispatch(source, type, args, (listeners, args) => {
        for (const listener of listeners.values()) {
            if (listener.handleEvent) {
                listener.handleEvent.call(listener, args);
            } else {
                listener(args);
            }
        }
    });
}

// Send an asynchronous notification.
export function notifyAsync(source, type, args = {}) {
    const promises = [];
    args = { source, type, timestamp: performance.now(), ...args };
    const listeners = sources.get(source)?.[type];
    if (listeners) {
        for (const listener of listeners.values()) {
            promises.push(new Promise(resolve => { resolve(listener(args)); }));
        }
    }
    return Promise.all(promises);
}

// Dispatch an event, adding source, type and timestamp parameters.
function dispatch(source, type, args, f) {
    const listeners = sources.get(source)?.[type];
    if (listeners) {
        return f(listeners, { source, type, timestamp: performance.now(), ...args });
    }
}
