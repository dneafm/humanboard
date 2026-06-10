export type AutoDistillLevel = 'off' | 'low' | 'balanced' | 'high';

export const AUTO_DISTILL_LEVEL_STORAGE_KEY = 'humanboard:auto-distill-level';

export const AUTO_DISTILL_LEVELS: Array<{ value: AutoDistillLevel; label: string; description: string }> = [
  { value: 'off', label: 'Off', description: 'Only save when explicitly asked.' },
  { value: 'low', label: 'Low', description: 'Save only very durable, high-signal insights.' },
  { value: 'balanced', label: 'Balanced', description: 'Default selective distillation.' },
  { value: 'high', label: 'High', description: 'Capture more potentially useful distilled insights.' },
];

export const isAutoDistillLevel = (value: string | null | undefined): value is AutoDistillLevel => (
  value === 'off' || value === 'low' || value === 'balanced' || value === 'high'
);

export const getStoredAutoDistillLevel = () => {
  if (typeof window === 'undefined') return 'balanced' as const;
  const value = window.localStorage.getItem(AUTO_DISTILL_LEVEL_STORAGE_KEY);
  return isAutoDistillLevel(value) ? value : 'balanced';
};

export const setStoredAutoDistillLevel = (value: AutoDistillLevel) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTO_DISTILL_LEVEL_STORAGE_KEY, value);
};

export const autoDistillInstructionForLevel = (level: AutoDistillLevel) => {
  if (level === 'off') {
    return 'Do not create notes or ideas unless the user explicitly asks you to save, capture, remember, add, create, compile, or update one. Continue answering normally without writing inferred information to the board.';
  }
  if (level === 'low') {
    return 'Distill only exceptionally durable, non-obvious insights from the conversation. Do not save raw chat or a transcript. Save at most one cleaned note or one developed idea, and only when it is likely to remain useful later.';
  }
  if (level === 'high') {
    return 'Distill selectively but more proactively. Do not save raw chat or a transcript. Save up to two cleaned insights only when they are meaningfully useful later, deduplicated, and stronger than generic advice or temporary chatter.';
  }
  return 'Selectively distill only durable, meaningful information from the conversation. Do not save raw chat or a transcript. Save at most one cleaned note or one developed idea per response, only when it will remain useful later. Avoid duplicates, temporary details, generic advice, and operational chatter. Prefer a concise note for an early insight; create an idea only when the insight has a clear title, substance, and next action.';
};
