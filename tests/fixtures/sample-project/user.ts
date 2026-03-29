/* eslint-disable */

/**
 * User domain model and operations.
 */

import type { Post } from "./post.ts";
// @ts-expect-error -- zod is not installed; fixture exercises external import extraction
import { z } from "zod";

/** Represents a registered user in the system */
export type User = {
  name: string;
  age: number;
  posts: Post[];
};

type InternalConfig = {
  retryCount: number;
  timeout: number;
};

/**
 * Creates a new user with the given name and age.
 * @kuralPure
 */
export function createUser(name: string, age: number): User {
  return { name, age, posts: [] };
}

/**
 * Sends a welcome email to the user.
 * @kuralCauses Sends an email via the SMTP gateway
 */
export async function welcomeUser(user: User): Promise<void> {
  console.log(`Welcome, ${user.name}!`);
}

function validateAge(age: number): boolean {
  return age > 0 && age < 150;
}
