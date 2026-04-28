/** Shared HTTP test helpers for gateway adapter and pricing tests. */

const HTTP_OK = 200;

/** Builds a JSON-typed Response with the given body and status code. */
function jsonResponse(body: unknown, status: number = HTTP_OK): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export { jsonResponse };
