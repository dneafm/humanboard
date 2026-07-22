import { apiFetch } from './apiClient';

export type PublicNote = {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorBio: string;
  linkedFusionId: string | null;
  linkedFusionTitle: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  viewCount?: number;
  likeCount?: number;
  liked?: boolean;
};

export type PublicFusionWithCounts = {
  id: string;
  title: string;
  summary: string;
  type: string;
  audience: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorBio: string;
  authorId: string;
  viewCount?: number;
  likeCount?: number;
  liked?: boolean;
  tags?: string[];
};

export type DiscoverItem = (PublicFusionWithCounts | PublicNote) & { kind: 'fusion' | 'note' };

export type DiscoverResponse = {
  items: DiscoverItem[];
  count: number;
  sort: string;
  interestTags: string[];
};

export async function fetchPublicNotes(params: { authorId?: string; linkedFusionId?: string; tag?: string } = {}) {
  const search = new URLSearchParams();
  if (params.authorId) search.set('authorId', params.authorId);
  if (params.linkedFusionId) search.set('linkedFusionId', params.linkedFusionId);
  if (params.tag) search.set('tag', params.tag);
  const qs = search.toString();
  const response = await fetch(`/api/public/notes${qs ? `?${qs}` : ''}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to load notes (${response.status})`);
  }
  return response.json() as Promise<{ notes: PublicNote[]; count: number }>;
}

export async function fetchPublicNote(id: string): Promise<PublicNote> {
  const response = await fetch(`/api/public/notes/${encodeURIComponent(id)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to load note (${response.status})`);
  }
  return response.json();
}

export async function createPublicNote(input: {
  content: string;
  tags?: string[];
  linkedFusionId?: string | null;
}): Promise<PublicNote> {
  const response = await apiFetch('/api/public/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: input.content,
      tags: input.tags || [],
      linkedFusionId: input.linkedFusionId || null,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to publish note (${response.status})`);
  }
  const payload = await response.json();
  return payload.note;
}

export async function deletePublicNote(id: string): Promise<void> {
  const response = await apiFetch(`/api/public/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to delete note (${response.status})`);
  }
}

export async function recordView(type: 'fusion' | 'note', id: string): Promise<{ count: number; counted: boolean }> {
  try {
    const response = await fetch('/api/public/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, id }),
    });
    if (!response.ok) return { count: 0, counted: false };
    return response.json();
  } catch {
    return { count: 0, counted: false };
  }
}

export async function getLikeStatus(type: 'fusion' | 'note', id: string): Promise<{ liked: boolean; count: number }> {
  try {
    const response = await fetch(`/api/public/like?type=${type}&id=${encodeURIComponent(id)}`);
    if (!response.ok) return { liked: false, count: 0 };
    return response.json();
  } catch {
    return { liked: false, count: 0 };
  }
}

export async function toggleLike(type: 'fusion' | 'note', id: string): Promise<{ liked: boolean; count: number }> {
  const response = await fetch('/api/public/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, id }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to toggle like (${response.status})`);
  }
  return response.json();
}

export async function fetchDiscover(params: { sort?: 'trending' | 'latest' | 'forYou'; tags?: string[] } = {}): Promise<DiscoverResponse> {
  const search = new URLSearchParams();
  if (params.sort) search.set('sort', params.sort);
  if (params.tags && params.tags.length) search.set('tags', params.tags.join(','));
  const qs = search.toString();
  const response = await fetch(`/api/public/discover${qs ? `?${qs}` : ''}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to load discover (${response.status})`);
  }
  return response.json();
}

const INTERESTS_KEY = 'humanboard:public:interests';

export function getInterestTags(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INTERESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function setInterestTags(tags: string[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const unique = Array.from(new Set(tags.map((t) => t.toLowerCase().trim()).filter(Boolean))).slice(0, 20);
    localStorage.setItem(INTERESTS_KEY, JSON.stringify(unique));
  } catch {}
}

export function addInterestTag(tag: string): string[] {
  const current = getInterestTags();
  const normalized = tag.toLowerCase().trim();
  if (!normalized || current.includes(normalized)) return current;
  const next = [...current, normalized].slice(0, 20);
  setInterestTags(next);
  return next;
}

export function removeInterestTag(tag: string): string[] {
  const current = getInterestTags();
  const next = current.filter((t) => t !== tag.toLowerCase().trim());
  setInterestTags(next);
  return next;
}
