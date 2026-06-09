import type { Goal, Idea, Note } from '../../store';
import type { NotificationCandidate } from './schema';

type NotificationInput = {
  notes: Note[];
  ideas: Idea[];
  goals: Goal[];
};

function startOfDay(value = new Date()) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function candidate(input: Omit<NotificationCandidate, 'schedule' | 'channels'> & {
  dedupeKey: string;
  cooldownHours: number;
}): NotificationCandidate {
  const now = new Date();
  return {
    type: input.type,
    title: input.title,
    body: input.body,
    insight: input.insight,
    insightConfidence: input.insightConfidence,
    tone: input.tone,
    trigger: input.trigger,
    action: input.action,
    channels: ['in_app', 'browser'],
    schedule: {
      scheduledFor: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      cooldownHours: input.cooldownHours,
      dedupeKey: input.dedupeKey,
    },
  };
}

export function buildNotificationCandidates({ notes, ideas, goals }: NotificationInput): NotificationCandidate[] {
  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const todayNotes = notes.filter((note) => new Date(note.createdAt).getTime() >= todayStart);
  const candidates: NotificationCandidate[] = [];

  if (todayNotes.length >= 2) {
    candidates.push(candidate({
      type: 'daily_synthesis',
      title: 'Today is taking shape',
      body: `${todayNotes.length} new notes are waiting to be compressed into a clearer signal.`,
      insight: 'Several captures landed today; a short synthesis pass may reveal the common thread.',
      insightConfidence: Math.min(0.95, 0.55 + todayNotes.length * 0.08),
      tone: 'quiet',
      trigger: {
        kind: 'note',
        entityIds: todayNotes.map((note) => note.id),
        ruleId: 'daily-notes-synthesis-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Review today', deepLink: '/review' },
      cooldownHours: 20,
      dedupeKey: `daily_synthesis:${now.toISOString().slice(0, 10)}`,
    }));
  }

  const weakenedNotes = notes.filter((note) => note.signalAssessment?.direction === 'Weakens');
  if (weakenedNotes.length) {
    const latest = [...weakenedNotes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    candidates.push(candidate({
      type: 'contradiction_detected',
      title: 'A belief may need pressure-testing',
      body: latest.content.replace(/\s+/g, ' ').trim().slice(0, 140),
      insight: 'A recent signal weakens an existing direction. Review it before the contradiction becomes invisible.',
      insightConfidence: Math.max(0.6, (latest.signalAssessment?.confidence ?? 6) / 10),
      tone: 'curious',
      trigger: {
        kind: 'note',
        entityIds: [latest.id],
        ruleId: 'weakening-signal-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Inspect signal', deepLink: '/review' },
      cooldownHours: 72,
      dedupeKey: `contradiction_detected:${latest.id}`,
    }));
  }

  const staleIdea = ideas
    .filter((idea) => idea.stage !== 'Archived')
    .map((idea) => ({ idea, ageDays: (Date.now() - new Date(idea.lastReviewed).getTime()) / 86_400_000 }))
    .filter(({ ageDays }) => ageDays >= 30)
    .sort((a, b) => b.ageDays - a.ageDays)[0]?.idea;
  if (staleIdea) {
    candidates.push(candidate({
      type: 'memory_resurfaced',
      title: 'An old idea still has unfinished energy',
      body: staleIdea.title,
      insight: staleIdea.summary || 'This idea has not been reviewed recently and may look different now.',
      insightConfidence: 0.68,
      tone: 'curious',
      trigger: {
        kind: 'idea',
        entityIds: [staleIdea.id],
        ruleId: 'stale-idea-resurface-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Revisit idea', deepLink: `/ideas/${staleIdea.id}` },
      cooldownHours: 24 * 14,
      dedupeKey: `memory_resurfaced:${staleIdea.id}`,
    }));
  }

  const unfinishedGoal = goals.find((goal) => (
    goal.status === 'Active' && !(goal.roadmap?.todos?.length || goal.roadmap?.ideas?.length || goal.roadmap?.knowledge?.length)
  ));
  if (unfinishedGoal) {
    candidates.push(candidate({
      type: 'unfinished_loop',
      title: 'An active goal has no next foothold',
      body: unfinishedGoal.title,
      insight: 'The goal is active, but it has no roadmap items. Naming one next step may reduce background tension.',
      insightConfidence: 0.76,
      tone: 'direct',
      trigger: {
        kind: 'goal',
        entityIds: [unfinishedGoal.id],
        ruleId: 'active-goal-without-roadmap-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Open goal', deepLink: '/goals' },
      cooldownHours: 72,
      dedupeKey: `unfinished_loop:${unfinishedGoal.id}`,
    }));
  }

  return candidates;
}

export function isQuietHours(startHour: number, endHour: number, hour = new Date().getHours()) {
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}
