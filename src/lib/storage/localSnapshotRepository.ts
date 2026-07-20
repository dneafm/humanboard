import { defaultSnapshot } from './defaultSnapshot';
import type { AppSnapshot, StorageRepository } from './types';
import { useAuthStore } from '../../stores/authStore';
import { apiFetch } from '../apiClient';

const STORAGE_KEY = 'humanboard.app-snapshot.v1';

export type SaveTarget = 'local' | 'server' | 'both';
export type SaveResult = {
  target: SaveTarget;
  ok: boolean;
  localOk: boolean;
  serverOk: boolean;
  serverSkipped: boolean;
  error?: string;
  approxBytes: number;
  // Server payload rejected because it was too large for the request limit.
  // The user can fix this by trimming large fusions/notes before retrying.
  serverPayloadTooLarge?: boolean;
};

let lastSaveResult: SaveResult | null = null;
const saveResultListeners = new Set<(result: SaveResult) => void>();

export function getLastSaveResult(): SaveResult | null {
  return lastSaveResult;
}

export function subscribeSaveResults(listener: (result: SaveResult) => void): () => void {
  saveResultListeners.add(listener);
  return () => {
    saveResultListeners.delete(listener);
  };
}

function emitSaveResult(result: SaveResult) {
  lastSaveResult = result;
  saveResultListeners.forEach((listener) => {
    try {
      listener(result);
    } catch {
      // ignore listener failures
    }
  });
}

function getUserId() {
  return useAuthStore.getState().userId;
}

function getStorageKey() {
  const userId = getUserId();
  return userId ? `${STORAGE_KEY}.${userId}` : STORAGE_KEY;
}

async function fetchServerSnapshot(): Promise<AppSnapshot | null> {
  if (typeof fetch !== 'function') return null;
  const userId = getUserId();
  if (!userId) return null;

  try {
    const response = await apiFetch('/api/snapshot', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const parsed = (await response.json()) as Partial<AppSnapshot>;
    return {
      ...defaultSnapshot,
      ...parsed,
      notes: parsed.notes ?? defaultSnapshot.notes,
      ideas: parsed.ideas ?? defaultSnapshot.ideas,
      projects: parsed.projects ?? defaultSnapshot.projects,
      sections: parsed.sections?.length ? parsed.sections : defaultSnapshot.sections,
      goals: parsed.goals ?? defaultSnapshot.goals,
      reflections: parsed.reflections ?? defaultSnapshot.reflections,
      capabilityBets: parsed.capabilityBets ?? defaultSnapshot.capabilityBets,
      signalEvents: parsed.signalEvents ?? defaultSnapshot.signalEvents,
      capabilityTimelineEvents: parsed.capabilityTimelineEvents ?? defaultSnapshot.capabilityTimelineEvents,
      isDarkMode: parsed.isDarkMode ?? defaultSnapshot.isDarkMode,
      fusionItems: parsed.fusionItems ?? defaultSnapshot.fusionItems,
      fusionSuggestions: parsed.fusionSuggestions ?? defaultSnapshot.fusionSuggestions,
      lastDailyFusionScan: parsed.lastDailyFusionScan ?? defaultSnapshot.lastDailyFusionScan,
      chatThreads: (() => {
        const threads = parsed.chatThreads ?? [];
        const msgs = parsed.chatMessages ?? [];
        if (threads.length === 0 && msgs.length > 0) {
          return [{
            id: 'legacy-thread',
            title: 'Legacy Chat',
            messages: msgs,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }];
        }
        return threads;
      })(),
      activeThreadId: (() => {
        const threads = parsed.chatThreads ?? [];
        const msgs = parsed.chatMessages ?? [];
        if (threads.length === 0 && msgs.length > 0) {
          return 'legacy-thread';
        }
        return parsed.activeThreadId ?? defaultSnapshot.activeThreadId;
      })(),
    };
  } catch {
    return null;
  }
}

async function saveToServer(snapshot: AppSnapshot): Promise<{ ok: boolean; skipped: boolean; error?: string; tooLarge?: boolean }> {
  if (typeof fetch !== 'function') return { ok: false, skipped: true, error: 'fetch unavailable' };
  const userId = getUserId();
  if (!userId) return { ok: false, skipped: true, error: 'no userId' };

  try {
    await apiFetch('/api/snapshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(snapshot),
    });
    return { ok: true, skipped: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Express body-parser size errors come through as 413; the message
    // usually contains "request entity too large" or "PayloadTooLargeError".
    const tooLarge = /too large|413|payload/i.test(message);
    return { ok: false, skipped: false, error: message, tooLarge };
  }
}

export class LocalSnapshotRepository implements StorageRepository {
  async load(): Promise<AppSnapshot> {
    const serverSnapshot = await fetchServerSnapshot();
    if (serverSnapshot) return serverSnapshot;

    if (typeof window === 'undefined') return defaultSnapshot;
    try {
      const raw = window.localStorage.getItem(getStorageKey());
      if (!raw) return defaultSnapshot;
      const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
      const finalSnapshot: AppSnapshot = {
        ...defaultSnapshot,
        ...parsed,
        notes: parsed.notes ?? defaultSnapshot.notes,
        ideas: parsed.ideas ?? defaultSnapshot.ideas,
        projects: parsed.projects ?? defaultSnapshot.projects,
        sections: parsed.sections?.length ? parsed.sections : defaultSnapshot.sections,
        goals: parsed.goals ?? defaultSnapshot.goals,
        reflections: parsed.reflections ?? defaultSnapshot.reflections,
        capabilityBets: parsed.capabilityBets ?? defaultSnapshot.capabilityBets,
        signalEvents: parsed.signalEvents ?? defaultSnapshot.signalEvents,
        capabilityTimelineEvents: parsed.capabilityTimelineEvents ?? defaultSnapshot.capabilityTimelineEvents,
        isDarkMode: parsed.isDarkMode ?? defaultSnapshot.isDarkMode,
        fusionItems: parsed.fusionItems ?? defaultSnapshot.fusionItems,
        fusionSuggestions: parsed.fusionSuggestions ?? defaultSnapshot.fusionSuggestions,
        lastDailyFusionScan: parsed.lastDailyFusionScan ?? defaultSnapshot.lastDailyFusionScan,
        chatThreads: (() => {
          const threads = parsed.chatThreads ?? [];
          const msgs = parsed.chatMessages ?? [];
          if (threads.length === 0 && msgs.length > 0) {
            return [{
              id: 'legacy-thread',
              title: 'Legacy Chat',
              messages: msgs,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }];
          }
          return threads;
        })(),
        activeThreadId: (() => {
          const threads = parsed.chatThreads ?? [];
          const msgs = parsed.chatMessages ?? [];
          if (threads.length === 0 && msgs.length > 0) {
            return 'legacy-thread';
          }
          return parsed.activeThreadId ?? defaultSnapshot.activeThreadId;
        })(),
      };
      return finalSnapshot;
    } catch {
      return defaultSnapshot;
    }
  }

  async save(snapshot: AppSnapshot): Promise<SaveResult> {
    const serialized = JSON.stringify(snapshot);
    const approxBytes = serialized.length;
    let localOk = false;
    let localError: string | undefined;
    if (typeof window !== 'undefined') {
      try {
        // Browsers typically cap localStorage at 5-10 MB. Warn before we hit it.
        if (approxBytes > 4_500_000) {
          console.warn(
            `[HumanBoard] Local snapshot is ${(approxBytes / 1_000_000).toFixed(1)} MB — ` +
            `approaching the localStorage quota. The server snapshot will still be authoritative; ` +
            `consider trimming very large fusion bodies or exporting to clear space.`,
          );
        }
        window.localStorage.setItem(getStorageKey(), serialized);
        localOk = true;
      } catch (err) {
        // QuotaExceededError or other storage failure: do NOT abort the save —
        // fall through to saveToServer so the snapshot is at least persisted remotely.
        localError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[HumanBoard] localStorage save failed (${localError}). ` +
          `Continuing with server-only persistence; data will still reload from the server.`,
        );
      }
    }

    const serverResult = await saveToServer(snapshot);
    // "ok" is the strict-success flag: both layers persisted. The banner
    // is shown whenever either layer failed, so the user can see partial
    // failures (e.g. localStorage succeeded but the server rejected the
    // payload) and recover.
    const fullyOk = localOk && serverResult.ok;
    const result: SaveResult = {
      target: localOk && serverResult.ok ? 'both' : serverResult.ok ? 'server' : localOk ? 'local' : 'server',
      ok: fullyOk,
      localOk,
      serverOk: serverResult.ok,
      serverSkipped: serverResult.skipped,
      approxBytes,
      ...(serverResult.error ? { error: serverResult.error } : localError ? { error: `local: ${localError}` } : {}),
      ...(serverResult.tooLarge ? { serverPayloadTooLarge: true } : {}),
    };
    if (!fullyOk) {
      console.warn(
        `[HumanBoard] Snapshot save partial failure: ` +
        `localOk=${localOk}, serverOk=${serverResult.ok}, ` +
        `serverSkipped=${serverResult.skipped}, ` +
        `approxBytes=${approxBytes}, ` +
        `error=${result.error ?? 'unknown'}`,
      );
    }
    emitSaveResult(result);
    return result;
  }
}

export const localSnapshotRepository = new LocalSnapshotRepository();
