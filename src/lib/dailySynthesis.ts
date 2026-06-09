import type { AppSnapshot } from './storage/types';

export type DailySynthesis = {
  day: string;
  subject: string;
  insight: string;
  action: string;
  notification: string;
  generatedAt: string;
  sourceEntityIds: string[];
};

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'been', 'being', 'build', 'could', 'from', 'have',
  'into', 'more', 'most', 'need', 'only', 'other', 'should', 'that', 'their', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'using', 'want', 'what', 'when',
  'where', 'which', 'while', 'with', 'would', 'your',
]);

function storageKey(userId: string, day: string) {
  return `humanboard.daily-synthesis.v1.${userId}.${day}`;
}

export function localDayKey(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compact(value: string, max = 220) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function topThemes(snapshot: AppSnapshot) {
  const counts = new Map<string, number>();
  const text = [
    ...snapshot.notes.slice(0, 20).map((note) => note.content),
    ...snapshot.ideas.slice(0, 20).flatMap((idea) => [idea.title, idea.summary, ...(idea.tags ?? [])]),
    ...snapshot.goals.flatMap((goal) => [goal.title, goal.description]),
    ...snapshot.capabilityBets.flatMap((bet) => [bet.title, bet.thesis, ...bet.keywords]),
  ].join(' ').toLowerCase();

  for (const token of text.match(/[a-z0-9-]{4,}/g) ?? []) {
    if (STOP_WORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token);
}

export function buildDailySynthesisInput(snapshot: AppSnapshot) {
  const recentThreshold = Date.now() - 7 * 86_400_000;
  const activeGoals = snapshot.goals.filter((goal) => goal.status === 'Active');
  const stalledGoals = snapshot.goals.filter((goal) => goal.status === 'Paused');
  const stalledProjects = snapshot.projects.filter((project) => project.status === 'Paused');
  const openQuestions = snapshot.ideas
    .filter((idea) => idea.type === 'Question' || (idea.openQuestions?.length ?? 0) > 0)
    .flatMap((idea) => [idea.title, ...(idea.openQuestions ?? [])])
    .slice(0, 8);
  const currentTensions = [
    ...snapshot.reflections.filter((item) => !item.dismissedAt).flatMap((item) => [item.pattern, item.question]),
    ...snapshot.notes
      .filter((note) => note.signalAssessment?.direction === 'Weakens' || note.signalAssessment?.direction === 'Mixed')
      .map((note) => note.content),
  ].slice(0, 8);
  const recentEdits = [
    ...snapshot.notes
      .filter((note) => new Date(note.createdAt).getTime() >= recentThreshold)
      .map((note) => ({ at: note.createdAt, text: `Note: ${compact(note.content)}`, id: note.id })),
    ...snapshot.ideas
      .filter((idea) => new Date(idea.lastReviewed).getTime() >= recentThreshold)
      .map((idea) => ({ at: idea.lastReviewed, text: `Idea: ${idea.title} — ${compact(idea.summary)}`, id: idea.id })),
    ...snapshot.capabilityBets
      .filter((bet) => new Date(bet.updatedAt).getTime() >= recentThreshold)
      .map((bet) => ({ at: bet.updatedAt, text: `Capability bet: ${bet.title} — ${compact(bet.thesis)}`, id: bet.id })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);

  return {
    summary: {
      activeGoals: activeGoals.slice(0, 8).map((goal) => `${goal.title}: ${compact(goal.description)}${goal.roadmap?.todos?.[0] ? ` | next: ${compact(goal.roadmap.todos[0])}` : ''}`),
      stalledItems: [
        ...stalledGoals.map((goal) => `Goal: ${goal.title}`),
        ...stalledProjects.map((project) => `Project: ${project.title}`),
      ].slice(0, 8),
      recentEdits: recentEdits.map((item) => item.text),
      repeatedThemes: topThemes(snapshot),
      openQuestions: openQuestions.map((item) => compact(item)),
      currentTensions: currentTensions.map((item) => compact(item)),
      upcomingDeadlines: [],
    },
    sourceEntityIds: Array.from(new Set([
      ...activeGoals.map((goal) => goal.id),
      ...stalledGoals.map((goal) => goal.id),
      ...stalledProjects.map((project) => project.id),
      ...recentEdits.map((item) => item.id),
    ])).slice(0, 20),
  };
}

export function readDailySynthesis(userId: string, day = localDayKey()) {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(storageKey(userId, day)) || 'null') as DailySynthesis | null;
    return value?.day === day ? value : null;
  } catch {
    return null;
  }
}

export function writeDailySynthesis(userId: string, synthesis: DailySynthesis) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId, synthesis.day), JSON.stringify(synthesis));
}
