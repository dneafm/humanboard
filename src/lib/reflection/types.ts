export type ReflectionSignalSource = {
  noteIds: string[];
  ideaIds: string[];
};

export type ReflectionCandidate = {
  summary: string;
  repeatedTerms: string[];
  source: ReflectionSignalSource;
  noteCount: number;
  ideaCount: number;
  signalScore: number;
};

export type GeneratedDigestArtifact = {
  title: string;
  summary: string;
  content: string;
  nextAction?: string;
  openQuestions?: string[];
  tags?: string[];
};

export type GeneratedReflection = {
  pattern: string;
  question: string;
  suggestion: string;
  principle?: GeneratedDigestArtifact | null;
  tension?: GeneratedDigestArtifact | null;
};
