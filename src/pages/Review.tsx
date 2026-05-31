import { useEffect, useMemo, useState } from 'react';
import { useAppStore, getReadinessScore, getReadinessState, type CapabilityBet, type EvidencePolarity, type Idea, type IdeaType, type Note, type SignalAssessment } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { Check, Sparkles, Archive, GitBranch, Clock, ArrowRight, Link2, AlertCircle, Inbox as InboxIcon, Target, X, Copy, Radar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { compileRawNoteToKnowledge, extractCapabilityEvidenceReview, sharpenIdeaArtifact } from '../lib/ai';
import ReflectionCard from '../components/reflection/ReflectionCard';
import { runReflectionPass } from '../lib/reflection/run';
import ExtractionReviewPanel from '../components/capability/ExtractionReviewPanel';

type ReviewIssueType = 'stale' | 'orphaned' | 'low-confidence' | 'no-next-action' | 'duplicate-candidate' | 'inbox-backlog' | 'capability-review' | 'incubation-readiness';

type ReviewItem = {
  id: string;
  entityType: 'note' | 'idea';
  entityId: string;
  issueType: ReviewIssueType;
  title: string;
  summary: string;
  whySurfaced: string;
  severity: 'low' | 'medium' | 'high';
  primaryAction: string;
  secondaryAction?: string;
  route?: string;
  ageLabel?: string;
  relatedEntityId?: string;
  relatedTitle?: string;
};

type CompileDraft = {
  noteId: string;
  title: string;
  summary: string;
  content: string;
  type: IdeaType;
  stage: 'Seed' | 'Sprouting' | 'Evergreen';
  confidence: number;
  maturity: number;
  nextAction: string;
  tags: string[];
  sourceNoteExcerpt: string;
  compileReason: string;
  openQuestions: string[];
};

type SharpenDraft = {
  ideaId: string;
  title: string;
  summary: string;
  content: string;
  confidence: number;
  maturity: number;
  nextAction: string;
  tags: string[];
  openQuestions: string[];
};

const COMPILE_TYPE_LABELS: IdeaType[] = ['Concept', 'Principle', 'Reference', 'Project', 'Question', 'Action', 'Base Skill', 'Umbrella Goal'];

const ISSUE_META: Record<ReviewIssueType, { label: string; icon: typeof Clock }> = {
  stale: { label: 'Stale', icon: Clock },
  orphaned: { label: 'Orphaned', icon: Link2 },
  'low-confidence': { label: 'Low confidence', icon: AlertCircle },
  'no-next-action': { label: 'No next action', icon: Target },
  'duplicate-candidate': { label: 'Duplicate candidate', icon: Copy },
  'inbox-backlog': { label: 'Inbox backlog', icon: InboxIcon },
  'capability-review': { label: 'Capability review', icon: Sparkles },
  'incubation-readiness': { label: 'Incubation', icon: Radar },
};

const FILTERS: Array<{ key: 'all' | ReviewIssueType; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'stale', label: 'Stale' },
  { key: 'orphaned', label: 'Orphaned' },
  { key: 'low-confidence', label: 'Low confidence' },
  { key: 'no-next-action', label: 'No next action' },
  { key: 'duplicate-candidate', label: 'Duplicates' },
  { key: 'inbox-backlog', label: 'Inbox backlog' },
  { key: 'capability-review', label: 'Capability review' },
  { key: 'incubation-readiness', label: 'Incubation' },
];

function daysSince(date: string) {
  return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24);
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTokenSet(value: string) {
  return new Set(normalizeText(value).split(' ').filter((token) => token.length > 2));
}

function getJaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function mergeIdeas(primary: Idea, duplicate: Idea): Idea {
  const mergedSummary = primary.summary.length >= duplicate.summary.length ? primary.summary : duplicate.summary;
  const mergedContent = primary.content.length >= duplicate.content.length ? primary.content : duplicate.content;
  const mergedTags = Array.from(new Set([...(primary.tags ?? []), ...(duplicate.tags ?? [])]));
  const mergedOpenQuestions = Array.from(new Set([...(primary.openQuestions ?? []), ...(duplicate.openQuestions ?? [])]));
  const mergedRelatedIdeaIds = Array.from(new Set([
    ...primary.relatedIdeaIds,
    ...duplicate.relatedIdeaIds,
    primary.id,
    duplicate.id,
  ].filter((id) => id !== primary.id)));

  return {
    ...primary,
    summary: mergedSummary,
    content: mergedContent,
    sectionId: primary.sectionId || duplicate.sectionId,
    confidence: Math.max(primary.confidence, duplicate.confidence),
    maturity: Math.max(primary.maturity, duplicate.maturity),
    nextAction: (primary.nextAction && primary.nextAction.trim().length >= (duplicate.nextAction?.trim().length ?? 0))
      ? primary.nextAction
      : duplicate.nextAction,
    lastReviewed: new Date().toISOString(),
    linkedNoteIds: Array.from(new Set([...primary.linkedNoteIds, ...duplicate.linkedNoteIds])),
    relatedIdeaIds: mergedRelatedIdeaIds,
    tags: mergedTags.length ? mergedTags : undefined,
    sourceNoteExcerpt: primary.sourceNoteExcerpt || duplicate.sourceNoteExcerpt,
    compileReason: primary.compileReason || duplicate.compileReason,
    openQuestions: mergedOpenQuestions.length ? mergedOpenQuestions : undefined,
    stage: primary.stage === 'Evergreen' || duplicate.stage === 'Evergreen'
      ? 'Evergreen'
      : primary.stage === 'Sprouting' || duplicate.stage === 'Sprouting'
        ? 'Sprouting'
        : 'Seed',
  };
}

function getIdeaIncubationReadiness(idea: Idea) {
  const readinessScore = idea.activationReadiness ? getReadinessScore(idea.activationReadiness) : idea.maturity;
  return {
    readinessScore,
    readinessState: getReadinessState(readinessScore),
  };
}

function getIncubationGuidance(readinessScore: number) {
  if (readinessScore >= 80) {
    return 'Start with one small reversible activation test instead of turning the whole idea into a full commitment.';
  }
  if (readinessScore >= 65) {
    return 'Define the tiniest reversible move that would prove this is really activation-near, then wait for one more confirming signal.';
  }
  return 'Keep incubating. Capture soft signals when they appear naturally and review again later without forcing execution.';
}

export default function ReviewPage() {
  const {
    ideas,
    notes,
    goals,
    projects,
    sections,
    reflections,
    capabilityBets,
    updateIdea,
    updateNote,
    deleteNote,
    addIdea,
    setIdeas,
    recomputeStrategicAlignment,
    addReflection,
    dismissReflection,
    setReflectionFeedback,
  } = useAppStore();
  const [activeFilter, setActiveFilter] = useState<'all' | ReviewIssueType>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compileDraft, setCompileDraft] = useState<CompileDraft | null>(null);
  const [sharpenDraft, setSharpenDraft] = useState<SharpenDraft | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [capabilityReviewError, setCapabilityReviewError] = useState<string | null>(null);
  const [compilingNoteId, setCompilingNoteId] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [orphanSectionId, setOrphanSectionId] = useState<string>('');
  const [orphanRelatedIdeaId, setOrphanRelatedIdeaId] = useState<string>('');
  const [isGeneratingReflection, setIsGeneratingReflection] = useState(false);
  const [reflectionError, setReflectionError] = useState<string | null>(null);
  const activeCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !bet.archivedAt), [capabilityBets]);

  const setCapabilityCandidateStatus = (note: Note, candidateId: string, status: 'accepted' | 'rejected') => {
    if (!note.extractionReview) return undefined;
    return {
      ...note.extractionReview,
      capabilityCandidates: note.extractionReview.capabilityCandidates.map((candidate) => (
        candidate.id === candidateId ? { ...candidate, status } : candidate
      )),
    };
  };

  const setIdeaCandidateStatus = (note: Note, candidateId: string, status: 'accepted' | 'rejected') => {
    if (!note.extractionReview) return undefined;
    return {
      ...note.extractionReview,
      ideaCandidates: note.extractionReview.ideaCandidates.map((candidate) => (
        candidate.id === candidateId ? { ...candidate, status } : candidate
      )),
    };
  };

  const ensureSignalAssessment = (note: Note, summary: string, polarity: EvidencePolarity): SignalAssessment => {
    if (note.signalAssessment) return note.signalAssessment;

    return {
      detected: true,
      strength: 6,
      confidence: 6,
      direction: polarity === 'supports' ? 'Supports' : polarity === 'contradicts' ? 'Weakens' : 'Mixed',
      horizon: 'Mid',
      thesis: summary,
      whyItMatters: summary,
      relatedBaseSkillIds: [] as string[],
      relatedUmbrellaGoalIds: [] as string[],
      relatedIdeaIds: [] as string[],
    };
  };

  const reviewItems = useMemo<ReviewItem[]>(() => {
    const items: ReviewItem[] = [];
    const duplicatePairs = new Set<string>();

    for (const idea of ideas) {
      const spawnedProject = projects.some((project) => project.sourceIdeaId === idea.id);
      const relatedGoal = goals.some((goal) =>
        [goal.title, goal.description, ...(goal.roadmap?.ideas ?? []), ...(goal.roadmap?.knowledge ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(idea.title.toLowerCase())
      );
      const relatedProject = projects.some((project) =>
        project.sourceIdeaId === idea.id ||
        `${project.title} ${project.description}`.toLowerCase().includes(idea.title.toLowerCase())
      );

      const staleDays = daysSince(idea.lastReviewed);
      const { readinessScore, readinessState } = getIdeaIncubationReadiness(idea);
      const isVehicle = idea.type === 'Project' || idea.strategicRole === 'Vehicle';
      const incubationSignalCount = (idea.linkedNoteIds?.length ?? 0) + (idea.relatedIdeaIds?.length ?? 0);

      if (isVehicle && !spawnedProject && (readinessScore >= 40 || (idea.activationReadiness && staleDays > 14))) {
        const whySurfaced = readinessScore >= 80
          ? `This incubating vehicle is ${readinessScore}% ready and looks activation-near. Review it explicitly before it drifts or turns into premature obligation.`
          : staleDays > 14
            ? `This incubating vehicle has sat for ${Math.floor(staleDays)} days. Review whether the readiness signal strengthened, weakened, or should stay parked.`
            : `This vehicle is in ${readinessState.toLowerCase()} territory at ${readinessScore}% readiness. It is warm enough to deserve a deliberate incubation review without forcing activation.`;

        items.push({
          id: `incubation-${idea.id}`,
          entityType: 'idea',
          entityId: idea.id,
          issueType: 'incubation-readiness',
          title: idea.title,
          summary: idea.summary,
          whySurfaced,
          severity: readinessScore >= 80 ? 'high' : readinessScore >= 65 || staleDays > 21 ? 'medium' : 'low',
          primaryAction: readinessScore >= 80 ? 'Review activation' : 'Review incubation',
          secondaryAction: 'Keep incubating',
          route: `/incubation?idea=${idea.id}`,
          ageLabel: formatDistanceToNow(new Date(idea.lastReviewed), { addSuffix: true }),
          relatedTitle: incubationSignalCount ? `${incubationSignalCount} linked signal${incubationSignalCount === 1 ? '' : 's'}` : undefined,
        });
      }

      if (staleDays > 7) {
        items.push({
          id: `stale-${idea.id}`,
          entityType: 'idea',
          entityId: idea.id,
          issueType: 'stale',
          title: idea.title,
          summary: idea.summary,
          whySurfaced: `Not reviewed for ${Math.floor(staleDays)} days. ${idea.type} items go stale fast when they still need shaping.`,
          severity: staleDays > 21 ? 'high' : 'medium',
          primaryAction: 'Review now',
          secondaryAction: 'Snooze',
          route: `/ideas/${idea.id}`,
          ageLabel: formatDistanceToNow(new Date(idea.lastReviewed), { addSuffix: true }),
        });
      }

      const orphaned = !idea.sectionId || (!idea.relatedIdeaIds.length && !idea.linkedNoteIds.length && !relatedGoal && !relatedProject);
      if (orphaned) {
        items.push({
          id: `orphaned-${idea.id}`,
          entityType: 'idea',
          entityId: idea.id,
          issueType: 'orphaned',
          title: idea.title,
          summary: idea.summary,
          whySurfaced: !idea.sectionId
            ? 'This knowledge artifact has no area/section yet, so it is floating without clear placement.'
            : 'This knowledge artifact has no note lineage, no idea links, and no visible connection to a goal or project.',
          severity: 'medium',
          primaryAction: 'Link or place',
          secondaryAction: 'Mark standalone',
          route: `/ideas/${idea.id}`,
        });
      }

      if (idea.confidence <= 4 || (idea.openQuestions?.length ?? 0) >= 3) {
        items.push({
          id: `confidence-${idea.id}`,
          entityType: 'idea',
          entityId: idea.id,
          issueType: 'low-confidence',
          title: idea.title,
          summary: idea.summary,
          whySurfaced: `Confidence is ${idea.confidence}/10${(idea.openQuestions?.length ?? 0) ? ` with ${idea.openQuestions?.length} open questions` : ''}, so this likely needs sharpening before it can be trusted.`,
          severity: idea.confidence <= 2 ? 'high' : 'medium',
          primaryAction: 'Sharpen',
          secondaryAction: 'Re-review',
          route: `/ideas/${idea.id}`,
        });
      }

      if (!idea.nextAction || idea.nextAction.trim().length < 12) {
        items.push({
          id: `next-${idea.id}`,
          entityType: 'idea',
          entityId: idea.id,
          issueType: 'no-next-action',
          title: idea.title,
          summary: idea.summary,
          whySurfaced: 'This artifact does not have a concrete next action, so it is hard to operationalize.',
          severity: 'medium',
          primaryAction: 'Add next step',
          secondaryAction: 'Connect to goal',
          route: `/ideas/${idea.id}`,
        });
      }
    }

    for (let index = 0; index < ideas.length; index += 1) {
      const idea = ideas[index];
      const baseTokens = getTokenSet(`${idea.title} ${idea.summary}`);

      for (let otherIndex = index + 1; otherIndex < ideas.length; otherIndex += 1) {
        const otherIdea = ideas[otherIndex];
        const pairKey = [idea.id, otherIdea.id].sort().join('::');
        if (duplicatePairs.has(pairKey)) continue;

        const exactTitleMatch = normalizeText(idea.title) === normalizeText(otherIdea.title);
        const similarity = getJaccardSimilarity(baseTokens, getTokenSet(`${otherIdea.title} ${otherIdea.summary}`));

        if (exactTitleMatch || similarity >= 0.72) {
          duplicatePairs.add(pairKey);
          items.push({
            id: `duplicate-${idea.id}-${otherIdea.id}`,
            entityType: 'idea',
            entityId: idea.id,
            relatedEntityId: otherIdea.id,
            relatedTitle: otherIdea.title,
            issueType: 'duplicate-candidate',
            title: idea.title,
            summary: idea.summary,
            whySurfaced: exactTitleMatch
              ? `This artifact has the same normalized title as “${otherIdea.title}”.`
              : `This artifact overlaps heavily with “${otherIdea.title}” (${Math.round(similarity * 100)}% token similarity across title and summary).`,
            severity: exactTitleMatch || similarity >= 0.82 ? 'high' : 'medium',
            primaryAction: 'Merge into related',
            secondaryAction: 'Open related',
            route: `/ideas/${idea.id}`,
          });
        }
      }
    }

    for (const note of notes) {
      const ageDays = daysSince(note.createdAt);
      const pendingCapabilityCandidates = note.extractionReview?.capabilityCandidates.filter((candidate) => candidate.status === 'pending').length ?? 0;
      const pendingIdeaCandidates = note.extractionReview?.ideaCandidates.filter((candidate) => candidate.status === 'pending').length ?? 0;
      const hasLinkedCapabilityEvidence = (note.capabilityBetIds?.length ?? 0) > 0;

      if (pendingCapabilityCandidates > 0 || pendingIdeaCandidates > 0 || (hasLinkedCapabilityEvidence && !note.capabilityEvidenceSummary?.trim())) {
        items.push({
          id: `capability-${note.id}`,
          entityType: 'note',
          entityId: note.id,
          issueType: 'capability-review',
          title: note.content.split('\n')[0].slice(0, 72) || 'Untitled note',
          summary: note.content.replace(/\s+/g, ' ').slice(0, 180),
          whySurfaced: pendingCapabilityCandidates > 0 || pendingIdeaCandidates > 0
            ? `This note has ${pendingCapabilityCandidates} pending capability candidate${pendingCapabilityCandidates === 1 ? '' : 's'} and ${pendingIdeaCandidates} pending idea-link candidate${pendingIdeaCandidates === 1 ? '' : 's'} waiting for review.`
            : 'This note is already linked to a capability bet, but its evidence summary still needs tightening before the signal stays trustworthy.',
          severity: pendingCapabilityCandidates > 0 ? 'high' : 'medium',
          primaryAction: note.extractionReview ? 'Refresh review' : 'Run extraction',
          secondaryAction: 'Revisit later',
          route: `/inbox?note=${note.id}`,
          ageLabel: formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }),
        });
      }

      if (ageDays > 3 || note.content.trim().length > 180) {
        items.push({
          id: `note-${note.id}`,
          entityType: 'note',
          entityId: note.id,
          issueType: 'inbox-backlog',
          title: note.content.split('\n')[0].slice(0, 72) || 'Untitled note',
          summary: note.content.replace(/\s+/g, ' ').slice(0, 180),
          whySurfaced: ageDays > 3
            ? `This raw note has sat in Inbox for ${Math.floor(ageDays)} days without being compiled.`
            : 'This raw note looks substantial enough to become a typed knowledge artifact.',
          severity: ageDays > 10 ? 'high' : 'medium',
          primaryAction: 'Compile',
          secondaryAction: 'Archive note',
          route: `/inbox?note=${note.id}`,
          ageLabel: formatDistanceToNow(new Date(note.createdAt), { addSuffix: true }),
        });
      }
    }

    const severityRank = { high: 0, medium: 1, low: 2 } as const;
    return items.sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.title.localeCompare(b.title));
  }, [goals, ideas, notes, projects]);

  const filteredItems = reviewItems.filter((item) => activeFilter === 'all' || item.issueType === activeFilter);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  const selectedIdea = selectedItem?.entityType === 'idea' ? ideas.find((entry) => entry.id === selectedItem.entityId) ?? null : null;
  const selectedNote = selectedItem?.entityType === 'note' ? notes.find((entry) => entry.id === selectedItem.entityId) ?? null : null;
  const selectedIncubationReadiness = selectedIdea
    ? getIdeaIncubationReadiness(selectedIdea)
    : null;
  const orphanLinkCandidates = selectedItem?.issueType === 'orphaned'
    ? ideas.filter((entry) => entry.id !== selectedItem.entityId).slice(0, 12)
    : [];
  const activeReflection = reflections.find((reflection) => !reflection.dismissedAt) ?? null;

  const counts = FILTERS.reduce<Record<string, number>>((acc, filter) => {
    acc[filter.key] = filter.key === 'all' ? reviewItems.length : reviewItems.filter((item) => item.issueType === filter.key).length;
    return acc;
  }, {});

  useEffect(() => {
    recomputeStrategicAlignment();
  }, [notes, ideas, recomputeStrategicAlignment]);

  const strategicReview = useMemo(() => {
    const signalNotes = notes.filter((note) => note.signalAssessment?.detected);
    const baseIdeas = ideas.filter((idea) => idea.type === 'Base Skill' || idea.strategicRole === 'Base');
    const vehicleIdeas = ideas.filter((idea) => idea.type === 'Project' || idea.strategicRole === 'Vehicle');

    const noteById = new Map(notes.map((note) => [note.id, note]));

    const baseAlignment = baseIdeas.map((idea) => ({
      idea,
      alignmentScore: idea.alignmentScore ?? 50,
      supportNotes: (idea.supportingNoteIds ?? []).map((id) => noteById.get(id)).filter(Boolean),
      weakeningNotes: (idea.weakeningNoteIds ?? []).map((id) => noteById.get(id)).filter(Boolean),
    })).sort((a, b) => b.alignmentScore - a.alignmentScore);

    const activationCandidates = vehicleIdeas
      .map((idea) => {
        const { readinessScore, readinessState } = getIdeaIncubationReadiness(idea);
        return {
          idea,
          readinessScore,
          readinessState,
        };
      })
      .filter((entry) => entry.readinessScore >= 40)
      .sort((a, b) => b.readinessScore - a.readinessScore);

    return {
      signalNotes,
      baseAlignment,
      activationCandidates,
      supportingSignals: signalNotes.filter((note) => note.signalAssessment?.direction === 'Supports').length,
      weakeningSignals: signalNotes.filter((note) => note.signalAssessment?.direction === 'Weakens').length,
    };
  }, [ideas, notes]);

  const runCapabilityReview = async (noteId: string) => {
    const note = notes.find((entry) => entry.id === noteId);
    if (!note) return;

    setCapabilityReviewError(null);
    setReviewingNoteId(noteId);

    try {
      const result = await extractCapabilityEvidenceReview({
        noteContent: note.content,
        capabilityBets: activeCapabilityBets.map((bet) => ({
          id: bet.id,
          title: bet.title,
          thesis: bet.thesis,
          keywords: bet.keywords,
        })),
        ideas: ideas
          .filter((idea) => idea.stage !== 'Archived')
          .map((idea) => ({
            id: idea.id,
            title: idea.title,
            summary: idea.summary,
            type: idea.type,
            strategicRole: idea.strategicRole,
          })),
      });

      updateNote(note.id, {
        extractionReview: {
          source: result.source,
          generatedAt: new Date().toISOString(),
          themes: result.themes,
          entities: result.entities,
          capabilityCandidates: result.capabilityCandidates.map((candidate) => {
            const previous = note.extractionReview?.capabilityCandidates.find((entry) => entry.capabilityBetId === candidate.capabilityBetId);
            return {
              ...candidate,
              id: previous?.id ?? `${note.id}:cap:${candidate.capabilityBetId}`,
              status: previous?.status ?? 'pending',
            };
          }),
          ideaCandidates: result.ideaCandidates.map((candidate) => {
            const previous = note.extractionReview?.ideaCandidates.find((entry) => entry.ideaId === candidate.ideaId);
            return {
              ...candidate,
              id: previous?.id ?? `${note.id}:idea:${candidate.ideaId}`,
              status: previous?.status ?? 'pending',
            };
          }),
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown extraction error.';
      setCapabilityReviewError(`Capability review failed. HumanBoard could not refresh extraction candidates right now. ${detail}`);
    } finally {
      setReviewingNoteId(null);
    }
  };

  const acceptCapabilityCandidate = (note: Note, candidateId: string) => {
    const candidate = note.extractionReview?.capabilityCandidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;

    updateNote(note.id, {
      capabilityBetIds: Array.from(new Set([...(note.capabilityBetIds ?? []), candidate.capabilityBetId])),
      capabilityEvidencePolarity: (note.capabilityBetIds?.length ?? 0) > 0
        ? (note.capabilityEvidencePolarity ?? candidate.polarity)
        : candidate.polarity,
      capabilityEvidenceSummary: note.capabilityEvidenceSummary?.trim() || candidate.summary,
      signalAssessment: ensureSignalAssessment(note, candidate.summary, candidate.polarity),
      extractionReview: setCapabilityCandidateStatus(note, candidateId, 'accepted'),
    });
  };

  const rejectCapabilityCandidate = (note: Note, candidateId: string) => {
    updateNote(note.id, {
      extractionReview: setCapabilityCandidateStatus(note, candidateId, 'rejected'),
    });
  };

  const acceptIdeaCandidate = (note: Note, candidateId: string) => {
    const candidate = note.extractionReview?.ideaCandidates.find((entry) => entry.id === candidateId);
    if (!candidate) return;

    const polarity = note.capabilityEvidencePolarity ?? 'supports';
    const assessment = ensureSignalAssessment(note, candidate.rationale, polarity);
    const field = candidate.relation === 'base-skill'
      ? 'relatedBaseSkillIds'
      : candidate.relation === 'umbrella-goal'
        ? 'relatedUmbrellaGoalIds'
        : 'relatedIdeaIds';

    updateNote(note.id, {
      signalAssessment: {
        ...assessment,
        [field]: Array.from(new Set([...(assessment[field] ?? []), candidate.ideaId])),
      },
      extractionReview: setIdeaCandidateStatus(note, candidateId, 'accepted'),
    });
  };

  const rejectIdeaCandidate = (note: Note, candidateId: string) => {
    updateNote(note.id, {
      extractionReview: setIdeaCandidateStatus(note, candidateId, 'rejected'),
    });
  };

  const generateReflection = async () => {
    setReflectionError(null);
    setIsGeneratingReflection(true);

    try {
      const generated = await runReflectionPass({ notes, ideas, reflections });
      if (!generated) return;

      addReflection({
        pattern: generated.pattern,
        question: generated.question,
        suggestion: generated.suggestion,
        sourceNoteIds: generated.sourceNoteIds,
        sourceIdeaIds: generated.sourceIdeaIds,
      });

      const digestTags = ['reflection-pass', ...(generated.principle?.tags ?? []), ...(generated.tension?.tags ?? [])]
        .map((tag) => String(tag).trim())
        .filter(Boolean);

      if (generated.principle) {
        addIdea({
          title: generated.principle.title,
          summary: generated.principle.summary,
          content: `DISTILLED FROM REFLECTION\n\nPattern: ${generated.pattern}\nQuestion: ${generated.question}\nSuggestion: ${generated.suggestion}\n\n${generated.principle.content}`,
          type: 'Principle',
          stage: 'Sprouting',
          confidence: 7,
          maturity: 55,
          nextAction: generated.principle.nextAction || generated.suggestion,
          linkedNoteIds: generated.sourceNoteIds,
          relatedIdeaIds: generated.sourceIdeaIds,
          tags: Array.from(new Set(['distilled-principle', ...digestTags, ...(generated.principle.tags ?? [])])).slice(0, 8),
          openQuestions: generated.principle.openQuestions ?? [],
        });
      }

      if (generated.tension) {
        addIdea({
          title: generated.tension.title,
          summary: generated.tension.summary,
          content: `UNRESOLVED TENSION\n\nPattern: ${generated.pattern}\nQuestion: ${generated.question}\nSuggestion: ${generated.suggestion}\n\n${generated.tension.content}`,
          type: 'Question',
          stage: 'Sprouting',
          confidence: 6,
          maturity: 45,
          nextAction: generated.tension.nextAction || generated.suggestion,
          linkedNoteIds: generated.sourceNoteIds,
          relatedIdeaIds: generated.sourceIdeaIds,
          tags: Array.from(new Set(['reflection-tension', ...digestTags, ...(generated.tension.tags ?? [])])).slice(0, 8),
          openQuestions: Array.from(new Set([generated.question, ...(generated.tension.openQuestions ?? [])].filter(Boolean))).slice(0, 5),
        });
      }
    } catch (error) {
      setReflectionError(error instanceof Error ? error.message : 'Reflection generation failed.');
    } finally {
      setIsGeneratingReflection(false);
    }
  };

  const runCompile = async (noteId: string) => {
    const note = notes.find((entry) => entry.id === noteId);
    if (!note) return;

    setCompileError(null);
    setCompilingNoteId(noteId);

    try {
      const compiled = await compileRawNoteToKnowledge(note.content);
      setCompileDraft({
        noteId,
        title: compiled.title || note.content.split('\n')[0].slice(0, 72),
        summary: compiled.summary || note.content.slice(0, 140),
        content: compiled.content || note.content,
        type: compiled.type || 'Reference',
        stage: compiled.stage || 'Sprouting',
        confidence: Math.max(1, Math.min(10, Number(compiled.confidence) || 7)),
        maturity: Math.max(0, Math.min(100, Number(compiled.maturity) || 55)),
        nextAction: compiled.nextAction || 'Review and refine this compiled knowledge page.',
        tags: Array.isArray(compiled.tags)
          ? compiled.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
          : [],
        sourceNoteExcerpt: String(compiled.sourceNoteExcerpt || note.content.slice(0, 220)).trim(),
        compileReason: String(compiled.compileReason || `This note was classified as ${compiled.type || 'Reference'} because that best matches its intent.`).trim(),
        openQuestions: Array.isArray(compiled.openQuestions)
          ? compiled.openQuestions.map((question) => String(question).trim()).filter(Boolean).slice(0, 5)
          : [],
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown AI runtime error.';
      setCompileError(`Compile failed. HumanBoard could not turn that note into structured knowledge. ${detail}`);
    } finally {
      setCompilingNoteId(null);
    }
  };

  const saveSharpenDraft = () => {
    if (!sharpenDraft) return;

    updateIdea(sharpenDraft.ideaId, {
      summary: sharpenDraft.summary.trim(),
      content: sharpenDraft.content.trim(),
      confidence: Math.max(1, Math.min(10, Number(sharpenDraft.confidence) || 5)),
      maturity: Math.max(0, Math.min(100, Number(sharpenDraft.maturity) || 50)),
      nextAction: sharpenDraft.nextAction.trim() || 'Review this artifact again after validating the remaining uncertainty.',
      tags: sharpenDraft.tags,
      openQuestions: sharpenDraft.openQuestions,
      lastReviewed: new Date().toISOString(),
    });

    setSharpenDraft(null);
    setSelectedId(null);
  };

  const saveCompiledDraft = () => {
    if (!compileDraft) return;

    addIdea({
      title: compileDraft.title.trim() || 'Untitled compiled artifact',
      summary: compileDraft.summary.trim() || compileDraft.content.slice(0, 140),
      content: compileDraft.content.trim(),
      type: compileDraft.type,
      stage: compileDraft.stage,
      sectionId: selectedSectionId || undefined,
      confidence: Math.max(1, Math.min(10, Number(compileDraft.confidence) || 7)),
      maturity: Math.max(0, Math.min(100, Number(compileDraft.maturity) || 55)),
      nextAction: compileDraft.nextAction.trim() || 'Review and refine this compiled knowledge page.',
      tags: compileDraft.tags,
      sourceNoteExcerpt: compileDraft.sourceNoteExcerpt.trim(),
      compileReason: compileDraft.compileReason.trim(),
      openQuestions: compileDraft.openQuestions,
      linkedNoteIds: [compileDraft.noteId],
      relatedIdeaIds: [],
    });

    deleteNote(compileDraft.noteId);
    setCompileDraft(null);
    setSelectedSectionId('');
    setSelectedId(null);
  };

  const handlePrimaryAction = async (item: ReviewItem) => {
    if (item.entityType === 'idea') {
      if (item.issueType === 'stale') {
        updateIdea(item.entityId, { lastReviewed: new Date().toISOString() });
      }
      if (item.issueType === 'incubation-readiness') {
        const idea = ideas.find((entry) => entry.id === item.entityId);
        if (!idea) return;
        const { readinessScore } = getIdeaIncubationReadiness(idea);
        updateIdea(item.entityId, {
          lastReviewed: new Date().toISOString(),
          nextAction: idea.nextAction?.trim() || getIncubationGuidance(readinessScore),
        });
      }
      if (item.issueType === 'no-next-action') {
        updateIdea(item.entityId, { nextAction: 'Review this artifact and decide the next concrete step.' });
      }
      if (item.issueType === 'low-confidence') {
        const idea = ideas.find((entry) => entry.id === item.entityId);
        if (!idea) return;

        setCompileError(null);
        setCompilingNoteId(item.entityId);

        try {
          const sharpened = await sharpenIdeaArtifact({
            title: idea.title,
            summary: idea.summary,
            content: idea.content,
            type: idea.type,
            stage: idea.stage,
            confidence: idea.confidence,
            maturity: idea.maturity,
            nextAction: idea.nextAction,
            openQuestions: idea.openQuestions,
            tags: idea.tags,
          });

          setSharpenDraft({
            ideaId: idea.id,
            title: idea.title,
            summary: String(sharpened.summary || idea.summary).trim(),
            content: String(sharpened.content || idea.content).trim(),
            confidence: Math.max(1, Math.min(10, Number(sharpened.confidence) || idea.confidence || 5)),
            maturity: Math.max(0, Math.min(100, Number(sharpened.maturity) || idea.maturity || 50)),
            nextAction: String(sharpened.nextAction || idea.nextAction || 'Review this artifact again after validating the remaining uncertainty.').trim(),
            tags: Array.isArray(sharpened.tags)
              ? sharpened.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
              : (idea.tags ?? []),
            openQuestions: Array.isArray(sharpened.openQuestions)
              ? sharpened.openQuestions.map((question) => String(question).trim()).filter(Boolean).slice(0, 6)
              : (idea.openQuestions ?? []),
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown AI runtime error.';
          setCompileError(`Sharpen failed. HumanBoard could not improve that artifact right now. ${detail}`);
        } finally {
          setCompilingNoteId(null);
        }
      }
      if (item.issueType === 'orphaned') {
        const fallbackSection = orphanSectionId || selectedIdea?.sectionId || sections[0]?.id;
        const relatedIdeaIds = Array.from(new Set([
          ...(selectedIdea?.relatedIdeaIds ?? []),
          ...(orphanRelatedIdeaId ? [orphanRelatedIdeaId] : []),
        ]));

        updateIdea(item.entityId, {
          sectionId: fallbackSection,
          relatedIdeaIds,
          nextAction: relatedIdeaIds.length
            ? 'Review whether this linked relationship is the right long-term placement for the artifact.'
            : 'Decide whether this artifact should stay standalone or connect to a stronger knowledge cluster.',
          lastReviewed: new Date().toISOString(),
        });

        if (orphanRelatedIdeaId) {
          const relatedIdea = ideas.find((entry) => entry.id === orphanRelatedIdeaId);
          if (relatedIdea && !relatedIdea.relatedIdeaIds.includes(item.entityId)) {
            updateIdea(relatedIdea.id, {
              relatedIdeaIds: [...relatedIdea.relatedIdeaIds, item.entityId],
            });
          }
        }

        setOrphanSectionId('');
        setOrphanRelatedIdeaId('');
      }
      if (item.issueType === 'duplicate-candidate' && item.relatedEntityId) {
        const duplicateIdea = ideas.find((entry) => entry.id === item.entityId);
        const primaryIdea = ideas.find((entry) => entry.id === item.relatedEntityId);

        if (duplicateIdea && primaryIdea) {
          const mergedPrimary = mergeIdeas(primaryIdea, duplicateIdea);
          const nextIdeas = ideas
            .filter((entry) => entry.id !== duplicateIdea.id)
            .map((entry) => {
              if (entry.id === primaryIdea.id) return mergedPrimary;
              if (entry.relatedIdeaIds.includes(duplicateIdea.id)) {
                return {
                  ...entry,
                  relatedIdeaIds: Array.from(new Set(entry.relatedIdeaIds.map((id) => (id === duplicateIdea.id ? primaryIdea.id : id)).filter((id) => id !== entry.id))),
                };
              }
              return entry;
            });

          setIdeas(nextIdeas);
          setSelectedId(null);
        }
      }
      return;
    }

    if (item.entityType === 'note' && item.issueType === 'capability-review') {
      await runCapabilityReview(item.entityId);
      return;
    }

    if (item.entityType === 'note' && item.issueType === 'inbox-backlog') {
      await runCompile(item.entityId);
    }
  };

  const handleSecondaryAction = (item: ReviewItem) => {
    if (item.entityType === 'note' && item.issueType === 'inbox-backlog') {
      deleteNote(item.entityId);
      return;
    }

    if (item.entityType === 'note' && item.issueType === 'capability-review') {
      setSelectedId(null);
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'stale') {
      updateIdea(item.entityId, { lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() });
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'incubation-readiness') {
      updateIdea(item.entityId, {
        lastReviewed: new Date().toISOString(),
        nextAction: 'Keep incubating. Review again only after new signals appear or the first small reversible move becomes obvious.',
      });
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'low-confidence') {
      updateIdea(item.entityId, { nextAction: 'Verify assumptions, answer open questions, and tighten the claim.' });
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'orphaned') {
      updateIdea(item.entityId, {
        nextAction: item.secondaryAction === 'Mark standalone'
          ? 'Keep as standalone knowledge artifact and review relevance later.'
          : 'Link this artifact to a related goal, note, or idea.',
        lastReviewed: new Date().toISOString(),
      });
      setOrphanSectionId('');
      setOrphanRelatedIdeaId('');
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'no-next-action') {
      updateIdea(item.entityId, { nextAction: 'Connect this artifact to a goal, project, or concrete decision path.' });
      return;
    }

    if (item.entityType === 'idea' && item.issueType === 'duplicate-candidate' && item.relatedEntityId) {
      setSelectedId(`duplicate-${item.relatedEntityId}-${item.entityId}`);
    }
  };

  if (reviewItems.length === 0 && !activeReflection) {
    return (
      <div className="max-w-4xl mx-auto w-full p-8 flex flex-col h-full items-center justify-center text-center">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <Check className="w-8 h-8 text-stone-400" />
        </div>
        <h2 className="text-2xl font-semibold text-stone-900 mb-2">Librarian queue is clear</h2>
        <p className="text-stone-500 max-w-md">Nothing obvious is stale, orphaned, low-confidence, sitting in Inbox too long, waiting on capability review, or warming toward activation right now.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Review</h1>
        <p className="text-stone-500 mt-1">HumanBoard librarian queue for stale, weak, orphaned, backlogged, incubation, and capability-linked knowledge.</p>
      </header>

      <div className="mb-8 space-y-4">
        <div className="rounded-3xl border border-violet-200 bg-violet-50/70 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-2">Strategic review</div>
              <p className="text-sm leading-relaxed text-stone-600 max-w-3xl">Signals now participate in review, not just inbox storage. This layer asks whether the world-state is supporting or weakening your base, and which vehicles are actually nearing activation.</p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl border border-violet-200 bg-white px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Signal notes</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">{strategicReview.signalNotes.length}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Supports</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">{strategicReview.supportingSignals}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-white px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-rose-600">Weakens</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900">{strategicReview.weakeningSignals}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Base alignment</div>
                  <p className="mt-1 text-sm text-stone-600">Which base skills are currently reinforced or pressured by your signal notes.</p>
                </div>
              </div>
              <div className="space-y-3">
                {strategicReview.baseAlignment.length ? strategicReview.baseAlignment.slice(0, 4).map(({ idea, alignmentScore, supportNotes, weakeningNotes }) => (
                  <div key={idea.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-semibold text-stone-900">{idea.title}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{idea.type}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-stone-900">{alignmentScore}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">alignment</div>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-stone-200 overflow-hidden mb-2">
                      <div className={`h-full ${alignmentScore >= 70 ? 'bg-emerald-500' : alignmentScore >= 45 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${alignmentScore}%` }} />
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2 text-xs text-stone-600">
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">{supportNotes.length} supporting</span>
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700">{weakeningNotes.length} weakening</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      <Link to={`/ideas/${idea.id}`} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-600 hover:border-stone-300 hover:text-stone-900">
                        <Link2 className="h-3 w-3" />
                        Open base
                      </Link>
                    </div>
                    {!!supportNotes.length && (
                      <div className="mb-3">
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600">Supporting notes</div>
                        <div className="flex flex-wrap gap-2">
                          {supportNotes.slice(0, 3).map((note) => note ? (
                            <Link key={note.id} to={`/inbox?note=${note.id}`} className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 hover:border-emerald-300">
                              {note.signalAssessment?.direction ?? 'Signal'} • {note.content.split('\n')[0].slice(0, 28) || 'Open note'}
                            </Link>
                          ) : null)}
                        </div>
                      </div>
                    )}
                    {!!weakeningNotes.length && (
                      <div>
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-rose-600">Weakening notes</div>
                        <div className="flex flex-wrap gap-2">
                          {weakeningNotes.slice(0, 3).map((note) => note ? (
                            <Link key={note.id} to={`/inbox?note=${note.id}`} className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-700 hover:border-rose-300">
                              {note.signalAssessment?.direction ?? 'Signal'} • {note.content.split('\n')[0].slice(0, 28) || 'Open note'}
                            </Link>
                          ) : null)}
                        </div>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500">No base-linked signal notes yet. As signals get linked to base skills, this panel will start showing alignment pressure.</div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Activation candidates</div>
              <p className="mt-1 mb-3 text-sm text-stone-600">Vehicles warming up toward execution, without forcing everything into active projects too early.</p>
              <div className="space-y-3">
                {strategicReview.activationCandidates.length ? strategicReview.activationCandidates.slice(0, 4).map(({ idea, readinessScore, readinessState }) => (
                  <div key={idea.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="text-sm font-semibold text-stone-900">{idea.title}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{readinessState}</div>
                      </div>
                      <div className="text-lg font-semibold text-stone-900">{readinessScore}%</div>
                    </div>
                    <div className="h-2 rounded-full bg-stone-200 overflow-hidden mb-2">
                      <div className={`h-full ${readinessScore >= 80 ? 'bg-emerald-500' : readinessScore >= 65 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${readinessScore}%` }} />
                    </div>
                    <p className="mb-3 text-xs leading-relaxed text-stone-600">{idea.nextAction || 'No next action yet. This likely needs one small reversible move.'}</p>
                    <Link to={`/ideas/${idea.id}`} className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-600 hover:border-stone-300 hover:text-stone-900">
                      <Link2 className="h-3 w-3" />
                      Open vehicle
                    </Link>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-6 text-sm text-stone-500">No vehicles are warming up yet. Once projects/vehicles gain readiness, they will show up here.</div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 mb-2">Reflection MVP</div>
            <p className="text-sm leading-relaxed text-stone-600 max-w-2xl">Generate one reflection from real notes and ideas. It should often return nothing when the signal is weak.</p>
          </div>
          <button
            type="button"
            onClick={() => void generateReflection()}
            disabled={isGeneratingReflection || Boolean(activeReflection)}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-violet-700 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isGeneratingReflection ? 'Generating...' : activeReflection ? 'Reflection active' : 'Generate reflection'}
          </button>
        </div>

        {reflectionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-500 mb-2">Reflection error</div>
                <p className="leading-relaxed">{reflectionError}</p>
              </div>
              <button type="button" onClick={() => setReflectionError(null)} className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700">Dismiss</button>
            </div>
          </div>
        )}

        {activeReflection && (
          <ReflectionCard
            reflection={activeReflection}
            onDismiss={() => dismissReflection(activeReflection.id)}
            onFeedback={(feedback) => setReflectionFeedback(activeReflection.id, feedback)}
          />
        )}
      </div>

      {capabilityReviewError && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400 mb-2">Capability review error</div>
              <p className="leading-relaxed">{capabilityReviewError}</p>
            </div>
            <button
              type="button"
              onClick={() => setCapabilityReviewError(null)}
              className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-600 hover:text-amber-800 dark:hover:text-amber-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {compileError && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-500 mb-2">Compile error</div>
              <p className="leading-relaxed">{compileError}</p>
            </div>
            <button
              type="button"
              onClick={() => setCompileError(null)}
              className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {sharpenDraft && (
        <div className="mb-8 rounded-3xl border border-sky-200 bg-sky-50/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-600 mb-2">Sharpen preview</div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{sharpenDraft.title}</h2>
              <p className="text-sm text-stone-600 mt-2 max-w-2xl leading-relaxed">Review the rewritten artifact before replacing the weaker version.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveSharpenDraft}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-sky-700 transition-colors"
              >
                <Check className="h-4 w-4" />
                Save sharpened artifact
              </button>
              <button
                type="button"
                onClick={() => setSharpenDraft(null)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 hover:border-stone-300"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Confidence</span>
              <input
                type="range"
                min={1}
                max={10}
                value={sharpenDraft.confidence}
                onChange={(e) => setSharpenDraft((draft) => (draft ? { ...draft, confidence: Number(e.target.value) } : draft))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-stone-500">{sharpenDraft.confidence}/10</div>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Maturity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={sharpenDraft.maturity}
                onChange={(e) => setSharpenDraft((draft) => (draft ? { ...draft, maturity: Number(e.target.value) } : draft))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-stone-500">{sharpenDraft.maturity}%</div>
            </label>
          </div>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Summary</span>
            <textarea
              value={sharpenDraft.summary}
              onChange={(e) => setSharpenDraft((draft) => (draft ? { ...draft, summary: e.target.value } : draft))}
              className="w-full min-h-[90px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5"
            />
          </label>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Sharpened content</span>
            <textarea
              value={sharpenDraft.content}
              onChange={(e) => setSharpenDraft((draft) => (draft ? { ...draft, content: e.target.value } : draft))}
              className="w-full min-h-[180px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5"
            />
          </label>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Next action</span>
            <input
              value={sharpenDraft.nextAction}
              onChange={(e) => setSharpenDraft((draft) => (draft ? { ...draft, nextAction: e.target.value } : draft))}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5"
            />
          </label>
        </div>
      )}

      {compileDraft && (
        <div className="mb-8 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-600 mb-2">Compile preview</div>
              <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{compileDraft.title || 'Untitled compiled artifact'}</h2>
              <p className="text-sm text-stone-600 mt-2 max-w-2xl leading-relaxed">Review this compiled artifact before saving it into the knowledge layer.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveCompiledDraft}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-emerald-700 transition-colors"
              >
                <Check className="h-4 w-4" />
                Save compiled artifact
              </button>
              <button
                type="button"
                onClick={() => setCompileDraft(null)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 hover:border-stone-300"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Type</span>
              <select
                value={compileDraft.type}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, type: e.target.value as IdeaType } : draft))}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
              >
                {COMPILE_TYPE_LABELS.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Suggested area</span>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
              >
                <option value="">No Area</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>{section.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Why this type</span>
              <textarea
                value={compileDraft.compileReason}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, compileReason: e.target.value } : draft))}
                className="w-full min-h-[96px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Source excerpt</span>
              <textarea
                value={compileDraft.sourceNoteExcerpt}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, sourceNoteExcerpt: e.target.value } : draft))}
                className="w-full min-h-[96px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Confidence</span>
              <input
                type="range"
                min={1}
                max={10}
                value={compileDraft.confidence}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, confidence: Number(e.target.value) } : draft))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-stone-500">{compileDraft.confidence}/10</div>
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Maturity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={compileDraft.maturity}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, maturity: Number(e.target.value) } : draft))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-stone-500">{compileDraft.maturity}%</div>
            </label>
          </div>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Summary</span>
            <textarea
              value={compileDraft.summary}
              onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, summary: e.target.value } : draft))}
              className="w-full min-h-[90px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
            />
          </label>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Compiled content</span>
            <textarea
              value={compileDraft.content}
              onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, content: e.target.value } : draft))}
              className="w-full min-h-[180px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
            />
          </label>

          <label className="block mb-4">
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Next action</span>
            <input
              value={compileDraft.nextAction}
              onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, nextAction: e.target.value } : draft))}
              className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5"
            />
          </label>
        </div>
      )}

      <div className="mb-6 rounded-3xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm dark:border-violet-900/30 dark:bg-violet-900/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">Strategic incubation</div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Signals are material, not obligations</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600 dark:text-stone-300">
              Review is where signal notes get interpreted. Active work should not absorb every interesting direction. Use Inbox for raw capture, Incubation for watchlist decisions, and only activate once readiness is genuinely strong.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Signal notes</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{strategicReview.signalNotes.length}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Base alignment tracked</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{strategicReview.baseAlignment.length}</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Activation candidates</div>
              <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{strategicReview.activationCandidates.length}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {FILTERS.map((filter) => {
          const active = activeFilter === filter.key;
          return (
            <button
              key={filter.key}
              onClick={() => {
                setActiveFilter(filter.key);
                setSelectedId(null);
              }}
              className={`rounded-2xl border p-4 text-left transition-colors ${active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-900 hover:bg-stone-50'}`}
            >
              <div className={`text-[10px] font-bold uppercase tracking-[0.22em] ${active ? 'text-stone-300' : 'text-stone-400'}`}>{filter.label}</div>
              <div className="mt-2 text-2xl font-semibold">{counts[filter.key]}</div>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] flex-1 min-h-0">
        <div className="space-y-3 overflow-y-auto pr-1">
          {filteredItems.map((item) => {
            const meta = ISSUE_META[item.issueType];
            const Icon = meta.icon;
            const selected = selectedItem?.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  if (item.issueType !== 'orphaned') {
                    setOrphanSectionId('');
                    setOrphanRelatedIdeaId('');
                  }
                }}
                className={`w-full rounded-2xl border p-5 text-left transition-all ${selected ? 'border-stone-900 bg-stone-900 text-white shadow-lg' : 'border-stone-200 bg-white hover:bg-stone-50'}`}
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selected ? 'text-stone-300' : 'text-stone-400'}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-[0.22em] ${selected ? 'text-stone-300' : 'text-stone-400'}`}>{meta.label}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-[0.22em] ${selected ? 'text-stone-400' : item.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`}>{item.severity}</span>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-[0.22em] ${selected ? 'text-stone-400' : 'text-stone-400'}`}>{item.entityType}</span>
                </div>
                <div className={`text-lg font-semibold mb-2 ${selected ? 'text-white' : 'text-stone-900'}`}>{item.title}</div>
                <p className={`${selected ? 'text-stone-300' : 'text-stone-600'} text-sm leading-relaxed line-clamp-2`}>{item.whySurfaced}</p>
              </button>
            );
          })}
        </div>

        {selectedItem && (
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm h-fit sticky top-8">
            <div className="flex items-center gap-2 mb-3">
              {(() => {
                const Icon = ISSUE_META[selectedItem.issueType].icon;
                return <Icon className="w-4 h-4 text-stone-400" />;
              })()}
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">{ISSUE_META[selectedItem.issueType].label}</span>
            </div>

            <h2 className="text-2xl font-semibold text-stone-900 mb-2">{selectedItem.title}</h2>
            <p className="text-stone-600 leading-relaxed mb-4">{selectedItem.summary}</p>

            <div className="rounded-2xl bg-stone-50 border border-stone-200 p-4 mb-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 mb-2">Why this surfaced</div>
              <p className="text-sm text-stone-700 leading-relaxed">{selectedItem.whySurfaced}</p>
            </div>

            {selectedItem.ageLabel && (
              <div className="text-xs text-stone-500 mb-4">Last activity {selectedItem.ageLabel}</div>
            )}

            {selectedItem.relatedTitle && selectedItem.relatedEntityId && (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-600 mb-2">Possible overlap</div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-stone-700 leading-relaxed">Potential canonical artifact: <span className="font-semibold">{selectedItem.relatedTitle}</span></p>
                  <Link to={`/ideas/${selectedItem.relatedEntityId}`} className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900">
                    Open related <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <p className="mt-3 text-xs text-amber-700">Merge keeps the related artifact as the canonical one, folds in stronger fields from this item, rewires duplicate links, then removes this duplicate.</p>
              </div>
            )}

            {selectedItem.issueType === 'incubation-readiness' && selectedIdea && selectedIncubationReadiness && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 mb-4 space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-2">Incubation state</div>
                  <p className="text-sm text-stone-700 leading-relaxed">
                    This is a deliberate incubation review, not a command to force execution. Decide whether the idea should keep warming, stay parked, or move toward one small reversible activation step.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Readiness</div>
                    <div className="mt-2 text-2xl font-semibold text-stone-900">{selectedIncubationReadiness.readinessScore}%</div>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">State</div>
                    <div className="mt-2 text-lg font-semibold text-stone-900">{selectedIncubationReadiness.readinessState}</div>
                  </div>
                  <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Signals linked</div>
                    <div className="mt-2 text-2xl font-semibold text-stone-900">{(selectedIdea.linkedNoteIds?.length ?? 0) + (selectedIdea.relatedIdeaIds?.length ?? 0)}</div>
                  </div>
                </div>
                {selectedIdea.activationReadiness && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ['Base strength', selectedIdea.activationReadiness.baseStrength],
                      ['Market signal', selectedIdea.activationReadiness.marketSignal],
                      ['Personal pull', selectedIdea.activationReadiness.personalPull],
                      ['Monetization clarity', selectedIdea.activationReadiness.monetizationClarity],
                      ['Timing', selectedIdea.activationReadiness.timing],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-stone-600">{label}</span>
                          <span className="text-sm font-semibold text-stone-900">{value}%</span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full ${Number(value) >= 80 ? 'bg-emerald-500' : Number(value) >= 65 ? 'bg-amber-500' : Number(value) >= 40 ? 'bg-sky-500' : 'bg-stone-400'}`}
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-2xl border border-violet-200/70 bg-white/80 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-600 mb-2">Activation guidance</div>
                  <p className="text-sm leading-relaxed text-stone-700">{getIncubationGuidance(selectedIncubationReadiness.readinessScore)}</p>
                </div>
              </div>
            )}

            {selectedNote && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 mb-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">Raw note preview</div>
                  <Link to={`/inbox?note=${selectedNote.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900">
                    Open in Inbox <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <p className="text-sm leading-relaxed text-stone-700 whitespace-pre-wrap line-clamp-6">{selectedNote.content}</p>
              </div>
            )}

            {selectedItem.issueType === 'capability-review' && selectedNote && (
              <div className="mb-4">
                <ExtractionReviewPanel
                  note={selectedNote}
                  capabilityBets={activeCapabilityBets}
                  ideas={ideas}
                  onRunReview={() => void runCapabilityReview(selectedNote.id)}
                  onAcceptCapability={(candidateId) => acceptCapabilityCandidate(selectedNote, candidateId)}
                  onRejectCapability={(candidateId) => rejectCapabilityCandidate(selectedNote, candidateId)}
                  onAcceptIdea={(candidateId) => acceptIdeaCandidate(selectedNote, candidateId)}
                  onRejectIdea={(candidateId) => rejectIdeaCandidate(selectedNote, candidateId)}
                  isRunning={reviewingNoteId === selectedNote.id}
                  compact
                />
              </div>
            )}

            {selectedItem.issueType === 'orphaned' && selectedIdea && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 mb-4 space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600 mb-2">Placement</div>
                  <p className="text-sm text-stone-700 leading-relaxed">Place this artifact into a real area and optionally attach it to a nearby knowledge artifact now, instead of only marking it for later.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Area</span>
                    <select
                      value={orphanSectionId || selectedIdea.sectionId || ''}
                      onChange={(e) => setOrphanSectionId(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5"
                    >
                      <option value="">No Area</option>
                      {sections.map((section) => (
                        <option key={section.id} value={section.id}>{section.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">Related artifact</span>
                    <select
                      value={orphanRelatedIdeaId}
                      onChange={(e) => setOrphanRelatedIdeaId(e.target.value)}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5"
                    >
                      <option value="">Leave unlinked</option>
                      {orphanLinkCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => void handlePrimaryAction(selectedItem)}
                disabled={compilingNoteId === selectedItem.entityId || reviewingNoteId === selectedItem.entityId}
                className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4" />
                {compilingNoteId === selectedItem.entityId
                  ? 'Compiling...'
                  : reviewingNoteId === selectedItem.entityId
                    ? 'Reviewing...'
                    : selectedItem.primaryAction}
              </button>
              <button
                onClick={() => handleSecondaryAction(selectedItem)}
                className="flex items-center justify-center gap-2 rounded-xl border border-stone-200 px-4 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {selectedItem.secondaryAction === 'Archive note' ? <Archive className="w-4 h-4" /> : <GitBranch className="w-4 h-4" />}
                {selectedItem.secondaryAction || 'Queue action'}
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              {selectedItem.route && (
                <Link to={selectedItem.route} className="text-sm text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
                  Open full artifact <ArrowRight className="w-3 h-3" />
                </Link>
              )}
              {selectedItem.entityType === 'idea' && (
                <button
                  onClick={() => updateIdea(selectedItem.entityId, { stage: 'Archived' })}
                  className="text-sm text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
                >
                  <Archive className="w-3 h-3" />
                  Archive
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
