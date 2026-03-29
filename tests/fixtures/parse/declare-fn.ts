/**
 * Fixture with a declare function (no body) and a function with duplicate calls.
 */

/** An ambient function declaration without a body */
declare function ambientFn(x: number): string;

const DOUBLE = 2;

/** A helper that doubles a number */
function helper(n: number): number {
  return n * DOUBLE;
}

/** A function that calls the same helper twice — exercises the dedup branch */
function callerWithDupes(a: number, b: number): number {
  const x = helper(a);
  const y = helper(b);
  return x + y;
}

export { ambientFn, helper, callerWithDupes };
