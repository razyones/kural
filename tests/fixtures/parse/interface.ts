/**
 * Fixture with interface declarations to exercise the isInterfaceDeclaration branch.
 */

/** A simple interface for testing */
export interface Greeter {
  name: string;
  greeting: string;
}

/** An internal options interface */
export interface InternalOptions {
  verbose: boolean;
  timeout: number;
}
