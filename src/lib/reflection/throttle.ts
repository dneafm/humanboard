import type { Reflection } from '../../store';
import type { ReflectionCandidate } from './types';

export function shouldThrottleReflection(candidate: ReflectionCandidate, reflections: Reflection[]) {
  const activeReflections = reflections.filter((reflection) => !reflection.dismissedAt);
  if (activeReflections.length >= 1) return true;

  const candidateKey = candidate.repeatedTerms.slice(0, 3).sort().join('|');
  if (!candidateKey) return true;

  return reflections.some((reflection) => {
    const sourceMatches = reflection.sourceIdeaIds.some((id) => candidate.source.ideaIds.includes(id))
      || reflection.sourceNoteIds.some((id) => candidate.source.noteIds.includes(id));
    return sourceMatches;
  });
}
