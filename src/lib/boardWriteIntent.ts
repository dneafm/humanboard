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

const WRITE_VERB_RE = /\b(save|store|remember|capture|record|add|create|compile|update|edit|revise|rewrite|expand|mark|attempt|try|change|modify|set|put|write|fill|populate|refresh|redo|rerun|reapply|fix|replace|swap|append|insert|delete|remove|drop|draft|compose|build|post|publish|share|send|keep|log|note|mention|make|generate|new|resubmit)\b/i;

const NEGATION_RE = /\b(don'?t|doesn'?t|do not|never|just (?:ask|asked|asking|wonder|wondered|wondering|think|thought|thinking|consider|considered|considering)|let'?s (?:discuss|discussed|discussing|talk|talked|talking|think|thought|thinking|consider|considered|considering)|not yet|not now)\b/i;

export function detectBoardWriteIntent(text: string | null | undefined): boolean {
  if (!text) return false;
  if (NEGATION_RE.test(text)) return false;
  return WRITE_VERB_RE.test(text);
}
