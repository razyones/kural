/** Blog post entity. */

/** A blog post authored by a user */
export type Post = {
  title: string;
  body: string;
  published: boolean;
};

/**
 * Formats a post for display.
 * @kuralUtil
 */
export function formatPost(post: Post): string {
  return `${post.title}\n\n${post.body}`;
}
