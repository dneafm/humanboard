import { defaultSnapshot } from './defaultSnapshot';
import type { AppSnapshot, StorageRepository } from './types';

const STORAGE_KEY = 'humanboard.app-snapshot.v1';
const SNAPSHOT_ENDPOINT = '/api/snapshot';

async function fetchServerSnapshot(): Promise<AppSnapshot | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(SNAPSHOT_ENDPOINT, { cache: 'no-store' });
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
    };
  } catch {
    return null;
  }
}

async function saveToServer(snapshot: AppSnapshot): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    await fetch(SNAPSHOT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultSnapshot;
      const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
      const finalSnapshot = {
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
      };
      return finalSnapshot;
    } catch {
      return defaultSnapshot;
    }
  }

  async save(snapshot: AppSnapshot): Promise<void> {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }
    await saveToServer(snapshot);
  }
}

export const localSnapshotRepository = new LocalSnapshotRepository();
