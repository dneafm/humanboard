import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAppStore } from '../store';

type SelectionState = {
  text: string;
  fieldPath: string;
  rect: { top: number; left: number; right: number; bottom: number };
  fusionId: string;
} | null;

/**
 * Floating "Edit with AI" popover that appears when the user selects
 * text inside any Fusion field (title, summary, body, etc.). Clicking
 * it opens a small instruction input; submitting dispatches a
 * requestAiEdit action to the store, which the Chatbot picks up
 * and turns into a synthetic user message.
 *
 * The popover positions itself just above the selection, falling
 * back to a fixed position near the textarea if the selection rect
 * is unavailable (rare for `<textarea>`).
 */
export function FusionTextEditPopover() {
  const [selection, setSelection] = useState<SelectionState>(null);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Track which Fusion detail page is open. The popover should only
  // fire when the user is editing the fusion on this page.
  const lastFusionIdRef = useRef<string | null>(null);
  useEffect(() => {
    // The Chatbot dispatches requestAiEdit with a fusionId. We track
    // it so we know the popover is on the right page.
    const unsub = useAppStore.subscribe((state) => {
      const pending = state.pendingAiEdit;
      if (pending) {
        lastFusionIdRef.current = pending.fusionId;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelection(null);
        setOpen(false);
        return;
      }
      const text = sel.toString();
      if (!text || text.trim().length < 3) {
        setSelection(null);
        setOpen(false);
        return;
      }
      // Find the closest Fusion field ancestor (title, summary,
      // centralConclusion, body, authorName, authorBio).
      const anchor = sel.anchorNode;
      if (!anchor) return;
      const el = (anchor.nodeType === Node.ELEMENT_NODE ? anchor as Element : anchor.parentElement)
        ?.closest('[data-fusion-field]');
      if (!el) {
        setSelection(null);
        setOpen(false);
        return;
      }
      const fieldPath = el.getAttribute('data-fusion-field');
      if (!fieldPath) return;
      // Get the Fusion id from the closest FusionDetail container
      // (we attach data-fusion-id to the page wrapper).
      const container = (el.closest('[data-fusion-id]') || document.querySelector('[data-fusion-id]')) as HTMLElement | null;
      const fusionId = container?.getAttribute('data-fusion-id') ?? null;
      if (!fusionId) {
        // We don't know which fusion this is. Skip rather than risk
        // editing the wrong one.
        setSelection(null);
        setOpen(false);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      setSelection({
        text,
        fieldPath,
        rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
        fusionId,
      });
      setOpen(false);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  // Close the popover if the user clicks outside it.
  useEffect(() => {
    if (!selection) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [selection]);

  if (!selection) return null;

  // Position the popover just above the selection. Fall back to a
  // sensible fixed position if the rect is degenerate.
  const top = Math.max(8, selection.rect.top - 56);
  const left = Math.max(8, Math.min(selection.rect.left, window.innerWidth - 360));

  const submit = () => {
    if (!instruction.trim()) return;
    setSubmitting(true);
    useAppStore.getState().requestAiEdit({
      fusionId: selection.fusionId,
      fieldPath: selection.fieldPath,
      selectedText: selection.text,
      instruction: instruction.trim(),
    });
    setOpen(false);
    setInstruction('');
    setSelection(null);
    // Reset the submitting flag after a short delay so the user can
    // re-select the same text and try again if needed.
    setTimeout(() => setSubmitting(false), 800);
  };

  return (
    <div
      ref={popoverRef}
      className="fixed z-[140] animate-in fade-in slide-in-from-top-2"
      style={{ top, left }}
    >
      {!open ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:scale-105 hover:shadow-amber-500/50"
          title="Edit this selection with AI"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Edit with AI
        </button>
      ) : (
        <div className="w-[340px] rounded-xl border border-amber-300 bg-white p-3 shadow-2xl dark:border-amber-700 dark:bg-stone-900">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <div className="flex-1 text-xs font-semibold text-stone-700 dark:text-stone-200">
              Edit <span className="text-amber-600 dark:text-amber-400">{selection.fieldPath}</span> with AI
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
              }}
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-2 max-h-24 overflow-y-auto rounded-md border border-stone-200 bg-stone-50 p-2 text-[11px] leading-relaxed text-stone-600 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-400">
            <span className="select-none text-stone-400">Selected: </span>
            {selection.text}
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
            placeholder="What should I change? e.g. 'make this more concise', 'add a dollar figure'…"
            autoFocus
            rows={3}
            className="w-full resize-none rounded-md border border-stone-200 bg-white px-2 py-1.5 text-xs text-stone-800 focus:border-amber-400 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={submit}
              disabled={!instruction.trim() || submitting}
              className="flex-1 rounded-md bg-amber-500 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {submitting ? 'Sending…' : 'Send to AI'}
            </button>
            <span className="text-[10px] text-stone-400">⌘↵</span>
          </div>
        </div>
      )}
    </div>
  );
}
