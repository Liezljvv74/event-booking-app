/**
 * Turning whatever was thrown into something a person can read.
 *
 * JavaScript lets anything be thrown, so a `catch` binds `unknown` and every
 * screen that shows a failure has to decide what to do with a value that may
 * not be an `Error` at all. That decision was written out fifteen times, once
 * per catch block, in nine files — and fifteen copies of a line is fifteen
 * places for the next thought about it to be applied to fourteen.
 *
 * The rules this app's failures actually follow:
 *
 * - The repository throws real `Error`s, with messages written to be shown
 *   ("Table 3 already seats 6 guests"), so an `Error`'s message is the whole
 *   answer and nothing is added to it.
 * - IndexedDB throws `DOMException`, which is an `Error` and needs no special
 *   case.
 * - Anything else is a bug rather than a message, but the screen still has to
 *   say something, so it says what it has.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
