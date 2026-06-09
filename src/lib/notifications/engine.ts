import type { Goal, Idea, Note } from '../../store';
import type { NotificationCandidate } from './schema';

type NotificationInput = {
  notes: Note[];
  ideas: Idea[];
  goals: Goal[];
};

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
  const candidates: NotificationCandidate[] = [];

  // 1. contradiction_detected
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

  // 2. memory_resurfaced
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

  // 3. unfinished_loop
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

  // 4. weekly_pattern: user has captures in the last 7 days.
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentNotes = notes.filter((note) => new Date(note.createdAt).getTime() >= sevenDaysAgo);
  if (recentNotes.length >= 1) {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday as start of week
    const weekStr = startOfWeek.toISOString().slice(0, 10);

    candidates.push(candidate({
      type: 'weekly_pattern',
      title: 'Weekly patterns are waiting',
      body: `You recorded ${recentNotes.length} captures this week. Let's look at the patterns in your thinking.`,
      insight: 'A weekly synthesis can help bubble up obsessions, avoided items, and repeated tension points.',
      insightConfidence: 0.8,
      tone: 'quiet',
      trigger: {
        kind: 'note',
        entityIds: recentNotes.slice(0, 5).map((n) => n.id),
        ruleId: 'weekly-pattern-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Review patterns', deepLink: '/review' },
      cooldownHours: 168, // 7 days
      dedupeKey: `weekly_pattern:${weekStr}`,
    }));
  }

  // 5. theme_recurrence: theme recurs >= 3 times in notes from the last 14 days.
  const fourteenDaysAgo = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const themeCounts: Record<string, { count: number; noteIds: string[] }> = {};
  notes.forEach((note) => {
    const noteTime = new Date(note.createdAt).getTime();
    if (noteTime >= fourteenDaysAgo && note.extractionReview?.themes) {
      note.extractionReview.themes.forEach((theme) => {
        if (!themeCounts[theme]) {
          themeCounts[theme] = { count: 0, noteIds: [] };
        }
        themeCounts[theme].count += 1;
        themeCounts[theme].noteIds.push(note.id);
      });
    }
  });

  const recurringThemes = Object.entries(themeCounts)
    .filter(([_, data]) => data.count >= 3)
    .sort((a, b) => b[1].count - a[1].count);

  if (recurringThemes.length > 0) {
    const [theme, data] = recurringThemes[0];
    candidates.push(candidate({
      type: 'theme_recurrence',
      title: 'A recurring theme is emerging',
      body: `The theme "${theme}" has appeared ${data.count} times in your recent notes.`,
      insight: `Your mind is orbiting "${theme}". Compiling these scattered notes into an Idea or Project could help structure this pattern.`,
      insightConfidence: Math.min(0.95, 0.6 + data.count * 0.05),
      tone: 'curious',
      trigger: {
        kind: 'note',
        entityIds: data.noteIds,
        ruleId: 'theme-recurrence-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Search theme', deepLink: `/search?q=${encodeURIComponent(theme)}` },
      cooldownHours: 72,
      dedupeKey: `theme_recurrence:${theme}`,
    }));
  }

  // 6. decision_support: stale Question idea or idea with openQuestions (>7 days since last review).
  const staleQuestionIdea = ideas
    .filter((idea) => idea.stage !== 'Archived')
    .filter((idea) => idea.type === 'Question' || (idea.openQuestions && idea.openQuestions.length > 0))
    .map((idea) => ({ idea, ageDays: (Date.now() - new Date(idea.lastReviewed).getTime()) / 86_400_000 }))
    .filter(({ ageDays }) => ageDays >= 7)
    .sort((a, b) => b.ageDays - a.ageDays)[0]?.idea;

  if (staleQuestionIdea) {
    candidates.push(candidate({
      type: 'decision_support',
      title: 'An open decision requires attention',
      body: staleQuestionIdea.title,
      insight: 'This question or decision needs review. Checking it against your latest signals might unlock the next action.',
      insightConfidence: 0.72,
      tone: 'direct',
      trigger: {
        kind: 'idea',
        entityIds: [staleQuestionIdea.id],
        ruleId: 'stale-question-decision-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Revisit decision', deepLink: `/ideas/${staleQuestionIdea.id}` },
      cooldownHours: 120, // 5 days
      dedupeKey: `decision_support:${staleQuestionIdea.id}`,
    }));
  }

  // 7. capture_prompt: user hasn't captured notes in last 48 hours.
  const latestNote = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const lastCaptureAgeMs = latestNote ? Date.now() - new Date(latestNote.createdAt).getTime() : Infinity;
  const todayStr = now.toISOString().slice(0, 10);
  if (lastCaptureAgeMs >= 48 * 60 * 60 * 1000) {
    candidates.push(candidate({
      type: 'capture_prompt',
      title: 'What is orbiting your mind right now?',
      body: 'It has been more than 2 days since your last capture. Drop a raw, messy thought before it fades.',
      insight: 'HumanBoard thrives on unfinished, contradictory, or emotional captures. You don\'t need to make them clean.',
      insightConfidence: 0.6,
      tone: 'encouraging',
      trigger: {
        kind: 'system',
        entityIds: [],
        ruleId: 'inbox-capture-nudge-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Open Inbox', deepLink: '/' },
      cooldownHours: 48,
      dedupeKey: `capture_prompt:${todayStr}`,
    }));
  }

  // 8. streak_nudge: capture streak milestone >= 3 consecutive days.
  const uniqueDates = Array.from(new Set(notes.map((note) => note.createdAt.slice(0, 10)))).sort().reverse();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  
  let streak = 0;
  if (uniqueDates.includes(todayStr) || uniqueDates.includes(yesterdayStr)) {
    let checkDate = uniqueDates.includes(todayStr) ? now : yesterday;
    while (true) {
      const checkStr = checkDate.toISOString().slice(0, 10);
      if (uniqueDates.includes(checkStr)) {
        streak++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      } else {
        break;
      }
    }
  }

  if (streak >= 3) {
    candidates.push(candidate({
      type: 'streak_nudge',
      title: 'Compounding thinking streak',
      body: `You have captured thoughts for ${streak} days in a row! Keep the compounding loop alive.`,
      insight: 'Capturing thoughts daily trains the subconscious to notice signals and patterns much faster.',
      insightConfidence: Math.min(0.95, 0.5 + streak * 0.05),
      tone: 'encouraging',
      trigger: {
        kind: 'system',
        entityIds: [],
        ruleId: 'capture-streak-milestone-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Go to Inbox', deepLink: '/' },
      cooldownHours: 48,
      dedupeKey: `streak_nudge:${streak}:${todayStr}`,
    }));
  }

  // 9. system_observation: user has >= 10 uncompiled raw notes.
  const compiledNoteIds = new Set(ideas.flatMap((idea) => idea.linkedNoteIds || []));
  const uncompiledNotes = notes.filter((note) => !compiledNoteIds.has(note.id));
  if (uncompiledNotes.length >= 10) {
    candidates.push(candidate({
      type: 'system_observation',
      title: 'Inbox clutter observation',
      body: `Your Inbox contains ${uncompiledNotes.length} uncompiled raw captures.`,
      insight: 'A cluttered inbox makes it harder to notice clear patterns. Compiling or archiving notes restores mental space.',
      insightConfidence: 0.7,
      tone: 'direct',
      trigger: {
        kind: 'system',
        entityIds: uncompiledNotes.slice(0, 10).map((n) => n.id),
        ruleId: 'inbox-clutter-observation-v1',
        observedAt: now.toISOString(),
      },
      action: { label: 'Run review pass', deepLink: '/review' },
      cooldownHours: 96, // 4 days
      dedupeKey: 'system_observation:inbox_clutter',
    }));
  }

  return candidates;
}

export function isQuietHours(startHour: number, endHour: number, hour = new Date().getHours()) {
  return startHour > endHour ? hour >= startHour || hour < endHour : hour >= startHour && hour < endHour;
}
