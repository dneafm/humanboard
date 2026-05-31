import type { Idea, Note } from '../../store';
import { buildReflectionDocuments, extractDocumentTerms } from './extract';
import type { ReflectionCandidate } from './types';

export function detectReflectionCandidate(notes: Note[], ideas: Idea[]): ReflectionCandidate | null {
  const documents = buildReflectionDocuments(notes, ideas);
  if (documents.length < 2) return null;

  const termHits = new Map<string, { count: number; noteIds: Set<string>; ideaIds: Set<string> }>();

  for (const doc of documents) {
    for (const term of extractDocumentTerms(doc.text)) {
      const current = termHits.get(term) ?? { count: 0, noteIds: new Set<string>(), ideaIds: new Set<string>() };
      current.count += 1;
      if (doc.kind === 'note') current.noteIds.add(doc.id);
      if (doc.kind === 'idea') current.ideaIds.add(doc.id);
      termHits.set(term, current);
    }
  }

  const ranked = [...termHits.entries()]
    .filter(([, hit]) => hit.count >= 2 && hit.count <= Math.max(6, Math.ceil(documents.length * 0.75)))
    .sort((a, b) => {
      const aSpread = a[1].noteIds.size + a[1].ideaIds.size;
      const bSpread = b[1].noteIds.size + b[1].ideaIds.size;
      return bSpread - aSpread || b[1].count - a[1].count || b[0].length - a[0].length;
    })
    .slice(0, 4);

  if (!ranked.length) return null;

  const totalSpread = new Set<string>();
  const noteIds = new Set<string>();
  const ideaIds = new Set<string>();

  for (const [, hit] of ranked) {
    for (const id of hit.noteIds) {
      noteIds.add(id);
      totalSpread.add(`n:${id}`);
    }
    for (const id of hit.ideaIds) {
      ideaIds.add(id);
      totalSpread.add(`i:${id}`);
    }
  }

  const signalScore = totalSpread.size + ranked.length;
  if (signalScore < 4) return null;

  return {
    summary: `Recurring focus around ${ranked.map(([term]) => term).join(', ')}`,
    repeatedTerms: ranked.map(([term]) => term),
    source: {
      noteIds: [...noteIds],
      ideaIds: [...ideaIds],
    },
    noteCount: noteIds.size,
    ideaCount: ideaIds.size,
    signalScore,
  };
}
