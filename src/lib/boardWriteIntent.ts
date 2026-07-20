/**
 * Pure intent detector for "is the user asking the chatbot to write to
 * the board?" Browser-free so it can be unit-tested without a window.
 *
 * History: the original implementation required a write verb to be
 * within 40 chars of a specific board noun (note/idea/fusion/...). That
 * silently blocked natural phrasings like "Let me attempt the update
 * again with a minimal body" — the LLM emitted a perfect toolcall but
 * the gate was closed.
 *
 * The new rule: any write-action verb anywhere in the message counts
 * as a write intent, EXCEPT for a small blacklist of strong-negation
 * phrasings ("don't", "just wondering", "let's discuss", etc.).
 *
 * False positives are cheap (the user can ignore a wrongly-created
 * fusion); false negatives were confusing the user into thinking the
 * bot was broken.
 */

const WRITE_VERB_RE = /\b(save|store|remember|capture|record|add|create|compile|update|edit|revise|rewrite|expand|mark|attempt|try|change|modify|set|put|write|fill|populate|refresh|redo|rerun|reapply|fix|replace|swap|append|insert|delete|remove|drop|draft|compose|build|post|publish|share|send|keep|log|note|mention|make|generate|new|resubmit|do|call|execute|use|invoke|run|go|proceed|continue|retry|process|apply|include|incorporate|populate|elaborate|refine|polish|tighten|improve|extend|flesh|show|display|alter|rewrite|redo|embed|tuck|throw|slip|sprinkle|update it|do it|do that|do this|fix it|change it|try again|try it|call the tool|use the tool|invoke the tool|run the tool|use the toolcall|use toolcall|include in|add in|add some|add more|include more|flesh out|fill in|add to|include in the|add in the|add to the|include to the|include in body|add to body|with examples|with more|with details|with context|with some|with a)\b/i;

/**
 * Subset of WRITE_VERB_RE used when looking for a verb after a
 * negation. Excludes the multi-word short-forms (e.g. "use the tool")
 * because those wouldn't naturally follow "don't/never".
 */
const ACTION_VERB_RE = /\b(save|store|add|create|update|edit|change|modify|set|put|write|fix|replace|remove|delete|drop|use|run|call|execute|do|post|publish|send)\b/i;

/**
 * Negation must be TARGETED at a write verb to count as blocking the
 * write. We don't block generic "I don't have / I don't know / the
 * user said don't update" — those are states of being or quoted text,
 * not negations of the current action.
 *
 * Examples that BLOCK:
 *   - "don't update the fusion"
 *   - "I don't want to update this"
 *   - "never save this"
 *   - "not yet, just thinking"
 *   - "let's discuss before we update"
 *
 * Examples that DO NOT block:
 *   - "I don't have the content yet, just put a placeholder"  (the
 *     second clause "just put a placeholder" is the actual request)
 *   - "I don't know if this will work, but try it"
 *   - "the user said don't update earlier"
 */
function isNegatedWriteAction(text: string): boolean {
  const t = text;
  // First, strip "I don't have / I don't know / I don't want" state-
  // of-being clauses (followed by their argument, up to 6 words).
  // These describe a state, not a negation of the current action.
  // e.g. "I don't have the content yet, just put a placeholder"
  //      becomes "                              just put a placeholder"
  //
  // "make" is intentionally NOT in this list — it doubles as a write
  // verb ("don't make any changes" should still block) and as a
  // forced-action verb ("don't make me write"). We keep the stricter
  // regex check below to catch the negation-of-make case explicitly.
  const stripped = t.replace(
    /\b(?:don'?t|doesn'?t|do not)\s+(?:have|know|want|need|think|see|feel|seem|believe|expect|suppose|remember|forget|realize|notice|recognize|understand|hear|imagine|mean|say|tell|like|hate|love|prefer|wish|got|have any|have the|have a|have an)\b(?:\s+\w+){0,6}?[,.;:]?/gi,
    ' ',
  );
  // Now check the remaining text for write-action negations.
  // "don't/doesn't/do not" within 2 words of a write verb.
  if (/\b(?:don'?t|doesn'?t|do not)\b(?:\s+\w+){0,2}?\s+(save|store|add|create|update|edit|change|modify|set|put|write|fix|replace|remove|delete|drop|use|run|call|execute|do|post|publish|send)\b/i.test(stripped)) return true;
  // "don't make / never make" — "make" is in the write-verb list but
  // it also acts as a forced-action verb, so we treat it as a write
  // negation when followed by another write-verb-like argument
  // (changes, edits, updates, modifications, anything, anything else,
  // a fusion, a note, etc.). This catches "don't make any changes",
  // "don't make a fusion", "never make a post here", etc.
  //
  // EXCEPT for "don't make me" / "don't make us" / "don't make
  // anyone" — those are forced-action constructions ("don't force
  // me to X") and should NOT block the write.
  if (
    /\b(?:don'?t|doesn'?t|do not|never)\s+make\s+(?:me|us|anyone|anybody|them|him|her|a soul)\b/i.test(t)
  ) {
    // forced-action construction — do not block
  } else if (
    /\b(?:don'?t|doesn'?t|do not|never)\s+make\b/i.test(t) ||
    /\b(?:don'?t|doesn'?t|do not|never)\s+(?:any|any\s+more|a|an|the|some)?\s*(?:more\s+)?(?:changes?|edits?|updates?|modifications?|writes?|saves?|fusion|note|idea|project)\b/i.test(t)
  ) {
    return true;
  }
  // "I don't want to X" with X a write verb
  if (/\bi don'?t want to\b(?:\s+\w+){0,2}?\s+(save|store|add|create|update|edit|change|modify|set|put|write|fix|replace|remove|delete|drop|use|run|call|execute|do|post|publish|send)\b/i.test(t)) return true;
  // "never X" with X a write verb
  if (/\bnever\s+(save|store|add|create|update|edit|change|modify|set|put|write|fix|replace|remove|delete|drop|use|run|call|execute|do|post|publish|send)\b/i.test(t)) return true;
  // Strong deferral / discussion phrasings
  if (/\bnot (?:yet|now)\b/i.test(t)) return true;
  if (/\bjust (?:ask|wonder|think|consider)(?:ing|s|ed)?\b/i.test(t)) return true;
  if (/\blet'?s (?:discuss|talk|think|consider)(?:ing|s|ed)?\b/i.test(t)) return true;
  return false;
}

export function detectBoardWriteIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  if (isNegatedWriteAction(text)) return false;
  return WRITE_VERB_RE.test(text);
}

// Re-export for testability.
export { ACTION_VERB_RE, isNegatedWriteAction };

