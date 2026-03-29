/** A registered user in the system. */
export type User = {
  /** The user's display name */
  name: string;
  /** The user's age in years */
  age: number;
};

/**
 * Greets a user by name.
 * @param name - The name to greet
 * @returns A greeting string
 */
export function greet(name: string): string {
  return `Hello, ${name}`;
}
