import { useEffect, useState, useMemo } from 'react';
import { X, FileText, Tag, Send, Loader2, AlertCircle, CheckCircle2, Link as LinkIcon } from 'lucide-react';
import { createPublicNote } from '../lib/publicEngagement';
import { useAppStore } from '../store';

type ComposeNoteModalProps = {
  open: boolean;
  onClose: () => void;
  onPublished?: (noteId: string) => void;
  defaultLinkedFusionId?: string;
};

export function ComposeNoteModal({ open, onClose, onPublished, defaultLinkedFusionId }: ComposeNoteModalProps) {
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [linkedFusionId, setLinkedFusionId] = useState<string>(defaultLinkedFusionId || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const fusionItems = useAppStore((s) => s.fusionItems);

  const publicFusions = useMemo(
    () => fusionItems.filter((f) => f.isPublic).sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)),
    [fusionItems]
  );

  useEffect(() => {
    if (!open) {
      setContent('');
      setTagsInput('');
      setLinkedFusionId(defaultLinkedFusionId || '');
      setError(null);
      setPublishedId(null);
    }
  }, [open, defaultLinkedFusionId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!content.trim() || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(/[,\s]+/)
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
        .slice(0, 8);
      const note = await createPublicNote({
        content: content.trim(),
        tags,
        linkedFusionId: linkedFusionId || null,
      });
      setPublishedId(note.id);
      if (onPublished) onPublished(note.id);
      setContent('');
      setTagsInput('');
      setLinkedFusionId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish note.');
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = content.length;
  const overLimit = charCount > 5000;
  const remaining = 5000 - charCount;
  const tagCount = tagsInput
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-stone-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-2xl flex flex-col max-h-[90vh]">
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-stone-800 shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h2 className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
              {publishedId ? 'Note published' : 'Write a public note'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-900 dark:hover:text-stone-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {publishedId ? (
          <div className="p-6">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 p-4 mb-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">Published to /shared/notes</div>
                <div className="text-xs text-emerald-700 dark:text-emerald-400/80 mt-0.5">
                  Your note is now live on the public feed.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/shared/notes/${publishedId}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-center rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-4 py-2 text-sm font-semibold hover:opacity-90 transition-all"
              >
                View public note
              </a>
              <button
                type="button"
                onClick={() => setPublishedId(null)}
                className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors"
              >
                Write another
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind? A short take, an observation, a quick reaction. Plain text or markdown."
                  autoFocus
                  rows={8}
                  className={`w-full resize-none rounded-xl border bg-stone-50 dark:bg-stone-950 px-4 py-3 text-sm leading-relaxed text-stone-900 dark:text-stone-100 focus:outline-none focus:bg-white dark:focus:bg-stone-950 transition-colors ${
                    overLimit
                      ? 'border-rose-300 dark:border-rose-800 focus:border-rose-500'
                      : 'border-stone-200 dark:border-stone-800 focus:border-stone-400 dark:focus:border-stone-700'
                  }`}
                />
                <div className={`mt-1 text-[10px] text-right ${overLimit ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-stone-400 dark:text-stone-500'}`}>
                  {charCount}/5000 {overLimit && `(${Math.abs(remaining)} over)`}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1.5">
                  <Tag className="h-3 w-3" />
                  Tags <span className="text-stone-400 dark:text-stone-600 normal-case font-normal">(comma or space separated, max 8)</span>
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="ai, writing, china"
                  className="w-full rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
                />
                {tagCount > 0 && (
                  <div className="mt-1.5 text-[10px] text-stone-500 dark:text-stone-500">
                    {tagCount} tag{tagCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {publicFusions.length > 0 && (
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-500 mb-1.5">
                    <LinkIcon className="h-3 w-3" />
                    Link to a public post <span className="text-stone-400 dark:text-stone-600 normal-case font-normal">(optional)</span>
                  </label>
                  <select
                    value={linkedFusionId}
                    onChange={(e) => setLinkedFusionId(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
                  >
                    <option value="">— None —</option>
                    {publicFusions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 px-3 py-2 text-sm text-rose-800 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <footer className="flex items-center gap-2 px-5 py-3 border-t border-stone-200 dark:border-stone-800 shrink-0 bg-stone-50/50 dark:bg-stone-900/30">
              <span className="text-[10px] text-stone-500 dark:text-stone-500">
                Press <kbd className="px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-800 font-mono">Esc</kbd> to close
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!content.trim() || submitting || overLimit}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Publish
                  </>
                )}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
