import { defaultSnapshot } from './defaultSnapshot';
import type { AppSnapshot, StorageRepository } from './types';
import { useAuthStore } from '../../stores/authStore';
import { apiFetch } from '../apiClient';

const STORAGE_KEY = 'humanboard.app-snapshot.v1';

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

async function saveToServer(snapshot: AppSnapshot): Promise<void> {
  if (typeof fetch !== 'function') return;
  const userId = getUserId();
  if (!userId) return;

  try {
    await apiFetch('/api/snapshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(snapshot),
    });
  } catch {
    // ignore failures, fall back to localStorage
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

  async save(snapshot: AppSnapshot): Promise<void> {
    if (typeof window !== 'undefined') {
      try {
        const serialized = JSON.stringify(snapshot);
        const approxBytes = serialized.length;
        // Browsers typically cap localStorage at 5-10 MB. Warn before we hit it.
        if (approxBytes > 4_500_000) {
          console.warn(
            `[HumanBoard] Local snapshot is ${(approxBytes / 1_000_000).toFixed(1)} MB — ` +
            `approaching the localStorage quota. The server snapshot will still be authoritative; ` +
            `consider trimming very large fusion bodies or exporting to clear space.`,
          );
        }
        window.localStorage.setItem(getStorageKey(), serialized);
      } catch (err) {
        // QuotaExceededError or other storage failure: do NOT abort the save —
        // fall through to saveToServer so the snapshot is at least persisted remotely.
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[HumanBoard] localStorage save failed (${message}). ` +
          `Continuing with server-only persistence; data will still reload from the server.`,
        );
      }
    }
    await saveToServer(snapshot);
  }
}

export const localSnapshotRepository = new LocalSnapshotRepository();
