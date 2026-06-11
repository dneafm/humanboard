import { defaultSnapshot } from './storage/defaultSnapshot';
import type { AppSnapshot } from './storage/types';

export type SnapshotImportMode = 'merge' | 'replace';

export type SnapshotImportCounts = {
  notes: number;
  ideas: number;
  projects: number;
  goals: number;
  reflections: number;
  capabilityBets: number;
};

const listKeys = [
  'notes',
  'ideas',
  'projects',
  'sections',
  'goals',
  'reflections',
  'capabilityBets',
  'signalEvents',
  'capabilityTimelineEvents',
] as const;

type SnapshotListKey = typeof listKeys[number];

function normalizedText(value: unknown) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function entityKeys(key: SnapshotListKey, item: unknown) {
  if (!item || typeof item !== 'object') return [];
  const entity = item as Record<string, unknown>;
  const id = normalizedText(entity.id);
  const keys = id ? [`id:${id}`] : [];

  if (key === 'notes') keys.push(`content:${normalizedText(entity.content)}`);
  else if (key === 'sections') keys.push(`name:${normalizedText(entity.name)}`);
  else if (key === 'reflections') keys.push(`content:${normalizedText(entity.content || entity.summary)}`);
  else if (key === 'signalEvents') keys.push(`signal:${normalizedText(entity.capabilityBetId)}:${normalizedText(entity.noteId)}:${normalizedText(entity.createdAt)}`);
  else if (key === 'capabilityTimelineEvents') keys.push(`timeline:${normalizedText(entity.capabilityBetId)}:${normalizedText(entity.createdAt)}:${normalizedText(entity.reason)}`);
  else keys.push(`title:${normalizedText(entity.title || entity.name)}`);

  return keys.filter((identity) => !identity.endsWith(':'));
}

function mergeList<T>(key: SnapshotListKey, current: T[], incoming: T[]) {
  const merged: T[] = [];
  const seen = new Set<string>();

  for (const item of [...current, ...incoming]) {
    const identities = entityKeys(key, item);
    if (identities.some((identity) => seen.has(identity))) continue;
    identities.forEach((identity) => seen.add(identity));
    merged.push(item);
  }

  return merged;
}

export function parseSnapshotImport(raw: string): AppSnapshot {
  const parsed = JSON.parse(raw) as Partial<AppSnapshot>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Snapshot must be a JSON object.');
  }

  const hasSnapshotData = listKeys.some((key) => Array.isArray(parsed[key]));
  if (!hasSnapshotData) {
    throw new Error('This file does not contain recognizable HumanBoard snapshot data.');
  }

  for (const key of listKeys) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
      throw new Error(`Snapshot field "${key}" must be an array.`);
    }
  }

  return {
    ...defaultSnapshot,
    ...parsed,
    notes: parsed.notes ?? [],
    ideas: parsed.ideas ?? [],
    projects: parsed.projects ?? [],
    sections: parsed.sections?.length ? parsed.sections : defaultSnapshot.sections,
    goals: parsed.goals ?? [],
    reflections: parsed.reflections ?? [],
    capabilityBets: parsed.capabilityBets ?? [],
    signalEvents: parsed.signalEvents ?? [],
    capabilityTimelineEvents: parsed.capabilityTimelineEvents ?? [],
    isDarkMode: parsed.isDarkMode ?? defaultSnapshot.isDarkMode,
    chatMessages: parsed.chatMessages ?? [],
  };
}

export function snapshotImportCounts(snapshot: AppSnapshot): SnapshotImportCounts {
  return {
    notes: snapshot.notes.length,
    ideas: snapshot.ideas.length,
    projects: snapshot.projects.length,
    goals: snapshot.goals.length,
    reflections: snapshot.reflections.length,
    capabilityBets: snapshot.capabilityBets.length,
  };
}

export function buildImportedSnapshot(current: AppSnapshot, incoming: AppSnapshot, mode: SnapshotImportMode): AppSnapshot {
  if (mode === 'replace') return incoming;

  return {
    ...current,
    notes: mergeList('notes', current.notes, incoming.notes),
    ideas: mergeList('ideas', current.ideas, incoming.ideas),
    projects: mergeList('projects', current.projects, incoming.projects),
    sections: mergeList('sections', current.sections, incoming.sections),
    goals: mergeList('goals', current.goals, incoming.goals),
    reflections: mergeList('reflections', current.reflections, incoming.reflections),
    capabilityBets: mergeList('capabilityBets', current.capabilityBets, incoming.capabilityBets),
    signalEvents: mergeList('signalEvents', current.signalEvents, incoming.signalEvents),
    capabilityTimelineEvents: mergeList('capabilityTimelineEvents', current.capabilityTimelineEvents, incoming.capabilityTimelineEvents),
    chatMessages: mergeList('notes', current.chatMessages ?? [], incoming.chatMessages ?? []),
  };
}
