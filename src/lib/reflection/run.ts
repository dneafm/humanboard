import { generateReflectionFromCandidate } from '../ai';
import type { Idea, Note, Reflection } from '../../store';
import { detectReflectionCandidate } from './detect';
import { shouldThrottleReflection } from './throttle';
import type { GeneratedReflection } from './types';

export async function runReflectionPass(input: {
  notes: Note[];
  ideas: Idea[];
  reflections: Reflection[];
}): Promise<(GeneratedReflection & { sourceNoteIds: string[]; sourceIdeaIds: string[] }) | null> {
  const candidate = detectReflectionCandidate(input.notes, input.ideas);
  if (!candidate) return null;

  if (shouldThrottleReflection(candidate, input.reflections)) return null;

  const generated = await generateReflectionFromCandidate({
    summary: candidate.summary,
    repeatedTerms: candidate.repeatedTerms,
    noteCount: candidate.noteCount,
    ideaCount: candidate.ideaCount,
    signalScore: candidate.signalScore,
  });

  if (!generated.shouldReflect) return null;

  const pattern = String(generated.pattern || '').trim();
  const question = String(generated.question || '').trim();
  const suggestion = String(generated.suggestion || '').trim();
  if (!pattern || !question || !suggestion) return null;

  const cleanArtifact = (artifact: typeof generated.principle) => {
    if (!artifact || typeof artifact !== 'object') return null;

    const title = String(artifact.title || '').trim();
    const summary = String(artifact.summary || '').trim();
    const content = String(artifact.content || '').trim();
    if (!title || !summary || !content) return null;

    return {
      title,
      summary,
      content,
      nextAction: String(artifact.nextAction || '').trim() || undefined,
      openQuestions: Array.isArray(artifact.openQuestions)
        ? artifact.openQuestions.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 5)
        : [],
      tags: Array.isArray(artifact.tags)
        ? artifact.tags.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 6)
        : [],
    };
  };

  return {
    pattern,
    question,
    suggestion,
    principle: cleanArtifact(generated.principle),
    tension: cleanArtifact(generated.tension),
    sourceNoteIds: candidate.source.noteIds,
    sourceIdeaIds: candidate.source.ideaIds,
  };
}
