/**
 * Debug event log for the HumanBoard chatbot pipeline.
 *
 * The chatbot has a multi-step pipeline (LLM call → toolcall parse → store
 * mutation → persist). When something goes wrong — the bot claims success
 * but nothing changed, or a fusion doesn't persist — we need to see the
 * exact intermediate state at each step. This module is a thin ring
 * buffer that captures those events.
 *
 * Browser-free so the unit tests can exercise it without a window.
 */

export type DebugEventType =
  | 'llm_request'
  | 'llm_response'
  | 'llm_truncated'
  | 'toolcall_detected'
  | 'toolcall_skipped'
  | 'toolcall_applied'
  | 'toolcall_failed'
  | 'store_mutation'
  | 'save_attempt'
  | 'save_result'
  | 'reconciliation'
  | 'user_message';

export interface DebugEvent {
  /** monotonic id for ordering */
  id: number;
  /** wall-clock timestamp */
  at: string;
  type: DebugEventType;
  /** short label for the row (e.g. "toolcall_update_fusion") */
  label: string;
  /** free-form payload — small enough to log inline */
  payload: Record<string, unknown>;
  /** optional failure reason (e.g. parse error message) */
  error?: string;
}

const MAX_EVENTS = 200;

class DebugEventLog {
  private events: DebugEvent[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();

  record(input: Omit<DebugEvent, 'id' | 'at'>): DebugEvent {
    const event: DebugEvent = {
      id: this.nextId++,
      at: new Date().toISOString(),
      ...input,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {
        // ignore listener errors
      }
    });
    return event;
  }

  list(): DebugEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
    this.listeners.forEach((l) => {
      try {
        l();
      } catch {
        // ignore
      }
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const debugLog = new DebugEventLog();

export function recordDebugEvent(input: Omit<DebugEvent, 'id' | 'at'>): DebugEvent {
  return debugLog.record(input);
}

/**
 * Render a payload as a compact single-line summary. Long strings are
 * truncated so the debug panel stays scannable. Used by DebugPanel.
 */
export function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const s = v.length > 120 ? `${v.slice(0, 117)}...` : v;
      parts.push(`${k}=${JSON.stringify(s)}`);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${String(v)}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length}]`);
    } else {
      try {
        const s = JSON.stringify(v);
        parts.push(`${k}=${s.length > 120 ? s.slice(0, 117) + '...' : s}`);
      } catch {
        parts.push(`${k}=[unserializable]`);
      }
    }
  }
  return parts.join(' ');
}
