import { useEffect, useState } from 'react';
import { debugLog, summarizePayload, type DebugEvent } from '../lib/debugLog';

const TYPE_COLORS: Record<string, string> = {
  llm_request: 'text-sky-300',
  llm_response: 'text-emerald-300',
  llm_truncated: 'text-rose-400',
  toolcall_detected: 'text-amber-300',
  toolcall_skipped: 'text-amber-500',
  toolcall_applied: 'text-emerald-400',
  toolcall_failed: 'text-rose-400',
  store_mutation: 'text-violet-300',
  save_attempt: 'text-stone-300',
  save_result: 'text-stone-300',
  reconciliation: 'text-cyan-300',
  user_message: 'text-stone-200',
};

const TYPE_BG: Record<string, string> = {
  llm_truncated: 'bg-rose-950/40 border-rose-900/60',
  toolcall_failed: 'bg-rose-950/40 border-rose-900/60',
  toolcall_skipped: 'bg-amber-950/30 border-amber-900/40',
  toolcall_applied: 'bg-emerald-950/30 border-emerald-900/40',
  save_result: 'bg-stone-900/30 border-stone-800/40',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

function EventRow({ event }: { event: DebugEvent }) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizePayload(event.payload);
  const preview = summary.length > 200 ? summary.slice(0, 197) + '...' : summary;
  const color = TYPE_COLORS[event.type] ?? 'text-stone-300';
  const bg = TYPE_BG[event.type] ?? '';
  return (
    <div className={`rounded border ${bg || 'border-stone-800/40'} px-2 py-1.5 font-mono text-[11px] leading-snug`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-stone-500 tabular-nums">{formatTime(event.at)}</span>
        <span className={`shrink-0 font-semibold ${color}`}>{event.type}</span>
        <span className="shrink-0 text-stone-400">·</span>
        <span className="shrink-0 text-stone-300">{event.label}</span>
      </div>
      {preview && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 block w-full text-left text-stone-400 hover:text-stone-200 break-words"
        >
          {expanded ? (
            <pre className="whitespace-pre-wrap break-words text-[10.5px] leading-tight">
{JSON.stringify(event.payload, null, 2)}
            </pre>
          ) : (
            <span className="line-clamp-2">{preview}</span>
          )}
        </button>
      )}
      {event.error && (
        <div className="mt-1 text-rose-300 break-words">error: {event.error}</div>
      )}
    </div>
  );
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<DebugEvent[]>(() => debugLog.list());
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    return debugLog.subscribe(() => setEvents(debugLog.list()));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ctrl+Shift+D (Cmd+Shift+D on mac) toggles the panel.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) return null;

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter);
  const allTypes = Array.from(new Set(events.map((e) => e.type)));

  const copyLog = async () => {
    const text = JSON.stringify(events, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // best-effort — if clipboard fails, the user can still select-all in the panel
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-stretch justify-end pointer-events-none">
      <button
        type="button"
        aria-label="Close debug panel"
        onClick={() => setOpen(false)}
        className="pointer-events-auto flex-1 bg-stone-950/70 backdrop-blur-sm"
      />
      <div className="pointer-events-auto flex h-full w-full max-w-xl flex-col border-l border-stone-800 bg-stone-950 text-stone-100 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-stone-800 px-3 py-2">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">
            Debug · {events.length}
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-stone-700 bg-stone-900 px-2 py-1 text-[11px] text-stone-200"
          >
            <option value="all">all</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={copyLog}
            className="rounded border border-stone-700 px-2 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
          >
            Copy JSON
          </button>
          <button
            type="button"
            onClick={() => debugLog.clear()}
            className="rounded border border-stone-700 px-2 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded border border-stone-700 px-2 py-1 text-[11px] text-stone-200 hover:bg-stone-800"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-stone-500">
              {events.length === 0
                ? 'No debug events yet. Trigger a chatbot message to see the pipeline.'
                : `No events matching filter "${filter}".`}
            </div>
          ) : (
            filtered.slice().reverse().map((e) => <EventRow key={e.id} event={e} />)
          )}
        </div>
        <div className="border-t border-stone-800 px-3 py-1.5 text-[10px] text-stone-500">
          Toggle with Ctrl+Shift+D. Newest first.
        </div>
      </div>
    </div>
  );
}
