/**
 * Throws an Error of `message` when `condition` is false. As Node's `assert`, but with no `assert` module, so code that
 * runs in a page as well as in Node can check its arguments.
 */
export function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message);
    }
}
