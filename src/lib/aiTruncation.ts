/**
 * Pure helpers for inspecting LLM response text. Kept in a browser-free
 * module so they can be unit-tested in a Node.js environment without
 * pulling in apiClient / authStore.
 */

/**
 * Scan an LLM response for unclosed `<toolcall_*>` blocks. If the response
 * was truncated mid-toolcall (e.g., max_tokens hit before the closing
 * tag), the regex-based parser will silently drop the call. Returning the
 * open tag name here lets the caller surface a clear error to the user
 * instead of a false "I created the fusion" success.
 */
export function detectTruncatedToolcall(text: string): string | null {
  if (!text) return null;
  const openTags = Array.from(text.matchAll(/<toolcall_([a-zA-Z0-9_]+)>/g));
  if (openTags.length === 0) return null;
  const closeTags = new Set(
    Array.from(text.matchAll(/<\/toolcall_([a-zA-Z0-9_]+)>/g)).map((m) => m[1]),
  );
  for (const m of openTags) {
    const name = m[1];
    if (!closeTags.has(name)) return name;
  }
  return null;
}
