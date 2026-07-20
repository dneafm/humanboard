/**
 * Pure helpers for verifying fusion update toolcall outcomes. Browser-free
 * so they can be unit-tested in a Node.js environment.
 */

export type FusionValue = string | number | boolean | string[] | undefined | null;

/**
 * Compare the values supplied by an update_fusion toolcall against the
 * pre-update state of the fusion. Returns the list of field names whose
 * values actually changed.
 *
 * The chatbot relies on this to detect "the model said it updated X to
 * Y but X was already Y" — a no-op update that the old parser reported
 * as success because the Zustand `set` call still ran.
 */
export function diffFusionFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  nextUpdates: Record<string, unknown>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(nextUpdates)) {
    const a = before[key];
    const b = after[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
        changed.push(key);
      }
    } else if (a !== b) {
      changed.push(key);
    }
  }
  return changed;
}
