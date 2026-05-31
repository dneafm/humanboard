import type { Idea, Note } from '../../store';

const STOP_WORDS = new Set([
  'the', 'and', 'that', 'with', 'from', 'this', 'have', 'your', 'about', 'into', 'there', 'their', 'would', 'could', 'should', 'while', 'where', 'when', 'what', 'which', 'will', 'just', 'than', 'then', 'them', 'they', 'been', 'being', 'were', 'also', 'more', 'some', 'very', 'over', 'under', 'only', 'does', 'really', 'still', 'because', 'through', 'after', 'before', 'like', 'want', 'need', 'make', 'made', 'using', 'used', 'user', 'idea', 'note', 'project', 'action', 'question', 'concept', 'reference', 'principle'
]);

export type ReflectionDocument = {
  id: string;
  kind: 'note' | 'idea';
  text: string;
};

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

export function buildReflectionDocuments(notes: Note[], ideas: Idea[]): ReflectionDocument[] {
  const noteDocs = notes.map((note) => ({
    id: note.id,
    kind: 'note' as const,
    text: note.content,
  }));

  const ideaDocs = ideas.map((idea) => ({
    id: idea.id,
    kind: 'idea' as const,
    text: [idea.title, idea.summary, idea.content, idea.nextAction ?? '', ...(idea.tags ?? []), ...(idea.openQuestions ?? [])]
      .join(' ')
      .trim(),
  }));

  return [...noteDocs, ...ideaDocs].filter((doc) => doc.text.trim().length >= 24);
}

export function extractDocumentTerms(text: string) {
  return Array.from(new Set(tokenize(text)));
}
