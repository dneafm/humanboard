import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Code, Eye, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '../store';

type SelectionState = {
  text: string;
  fieldPath: string;
  rect: { top: number; left: number; right: number; bottom: number };
  fusionId: string;
} | null;

/**
 * Output format the LLM should use when applying the edit. We pass
 * this to the model as part of the synthetic instruction so the
 * user can shape the structure of the replacement text.
 */
type OutputFormat =
  | 'same'        // preserve the original style (default)
  | 'markdown'    // use **bold**, *italic*, etc.
  | 'plain'       // no formatting
  | 'bullets'     // convert to a bullet list
  | 'numbered'    // convert to a numbered list
  | 'heading'     // start with a ## heading, then prose
  | 'quote';      // wrap in > blockquote

const FORMAT_OPTIONS: Array<{ value: OutputFormat; label: string; hint: string }> = [
  { value: 'same',     label: 'Same style',    hint: 'Preserve the original style' },
  { value: 'markdown', label: 'Markdown',      hint: 'Use **bold**, *italic*, headings, etc.' },
  { value: 'plain',    label: 'Plain text',    hint: 'No formatting' },
  { value: 'bullets',  label: 'Bullet list',   hint: 'Convert to a bullet list' },
  { value: 'numbered', label: 'Numbered list', hint: 'Convert to a numbered list' },
  { value: 'heading',  label: 'Heading',       hint: 'Start with a ## heading + prose' },
  { value: 'quote',    label: 'Blockquote',    hint: 'Wrap in a > blockquote' },
];

const FORMAT_INSTRUCTION: Record<OutputFormat, string> = {
  same:     'Preserve the original formatting style. Only change the words, not the structure.',
  markdown: 'Format the result with Markdown: use **bold** for emphasis, *italic*, `code`, ## headings, - bullets, etc.',
  plain:    'Output plain text with no Markdown formatting, no leading symbols, no headings.',
  bullets:  'Convert the result into a Markdown bullet list (each line starting with "- ").',
  numbered: 'Convert the result into a Markdown numbered list (each line starting with "1. ", "2. ", etc.).',
  heading:  'Start the result with a ## Markdown heading (one short line), then a blank line, then the prose.',
  quote:    'Wrap the result in a Markdown blockquote: start each line with "> ".',
};

/**
 * Floating "Edit with AI" popover that appears when the user selects
 * text inside any Fusion field (title, summary, body, etc.). Shows
 * the selected text in *rendered* form (markdown → HTML) by default
 * with a toggle to view the raw source, plus a format picker that
 * tells the LLM how to structure the replacement text.
 */
export function FusionTextEditPopover() {
  const [selection, setSelection] = useState<SelectionState>(null);
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [view, setView] = useState<'rendered' | 'raw'>('rendered');
  const [format, setFormat] = useState<OutputFormat>('same');
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Track which Fusion detail page is open. The popover should only
  // fire when the user is editing the fusion on this page.
  const lastFusionIdRef = useRef<string | null>(null);
  useEffect(() => {
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
      const container = (el.closest('[data-fusion-id]') || document.querySelector('[data-fusion-id]')) as HTMLElement | null;
      const fusionId = container?.getAttribute('data-fusion-id') ?? null;
      if (!fusionId) {
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

  useEffect(() => {
    if (!selection) return;
    const onClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFormatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [selection]);

  if (!selection) return null;

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
      outputFormat: format,
    });
    setOpen(false);
    setInstruction('');
    setSelection(null);
    setTimeout(() => setSubmitting(false), 800);
  };

  const formatLabel = FORMAT_OPTIONS.find((o) => o.value === format)?.label ?? 'Same style';
  const formatHint = FORMAT_OPTIONS.find((o) => o.value === format)?.hint ?? '';

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
        <div className="w-[380px] rounded-xl border border-amber-300 bg-white p-3 shadow-2xl dark:border-amber-700 dark:bg-stone-900">
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
                setFormatMenuOpen(false);
              }}
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Selected text preview (rendered or raw) */}
          <div className="mb-2 overflow-hidden rounded-md border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950">
            <div className="flex items-center justify-between gap-1 border-b border-stone-200 bg-stone-100/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500 dark:border-stone-800 dark:bg-stone-900/60">
              <span>Selected text</span>
              <div className="flex items-center gap-0.5 rounded bg-white/70 p-0.5 dark:bg-stone-800/70">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setView('rendered');
                  }}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                    view === 'rendered'
                      ? 'bg-amber-500 text-white'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                  title="Rendered (as it appears in the Fusion)"
                >
                  <Eye className="h-3 w-3" />
                  Rendered
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setView('raw');
                  }}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
                    view === 'raw'
                      ? 'bg-amber-500 text-white'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                  title="Raw source (markdown text)"
                >
                  <Code className="h-3 w-3" />
                  Raw
                </button>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto p-2 text-[11px] leading-relaxed text-stone-700 dark:text-stone-300">
              {view === 'rendered' ? (
                <div className="fusion-popover-prose prose prose-xs prose-stone max-w-none dark:prose-invert">
                  <ReactMarkdown>{selection.text}</ReactMarkdown>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-[10.5px] text-stone-600 dark:text-stone-400">
{selection.text}
                </pre>
              )}
            </div>
          </div>

          {/* Format picker — tells the LLM how to structure the replacement */}
          <div className="mb-2 flex items-center gap-1.5 text-[11px]">
            <span className="text-stone-500">Format:</span>
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFormatMenuOpen((v) => !v);
                }}
                className="flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs font-medium text-stone-700 hover:border-amber-400 hover:text-amber-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:text-amber-300"
                title={formatHint}
              >
                {formatLabel}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
              {formatMenuOpen && (
                <div
                  className="absolute left-0 top-full z-10 mt-1 w-52 rounded-md border border-stone-200 bg-white py-1 shadow-xl dark:border-stone-700 dark:bg-stone-900"
                  onClick={(e) => e.stopPropagation()}
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setFormat(opt.value);
                        setFormatMenuOpen(false);
                      }}
                      className={`block w-full px-2 py-1.5 text-left text-xs hover:bg-amber-50 dark:hover:bg-amber-950/40 ${
                        format === opt.value
                          ? 'bg-amber-50 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'text-stone-700 dark:text-stone-200'
                      }`}
                    >
                      <div>{opt.label}</div>
                      <div className="text-[10px] font-normal text-stone-500">{opt.hint}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {format !== 'same' && (
              <span className="text-[10px] text-amber-700 dark:text-amber-300" title={formatHint}>
                {formatHint}
              </span>
            )}
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
