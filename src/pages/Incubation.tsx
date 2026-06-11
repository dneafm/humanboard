import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Sparkles,
  Radar,
  Target,
  Coins,
  Heart,
  BrainCircuit,
  Globe2,
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  PenSquare,
  Plus,
  Archive,
  Waypoints,
  History,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useAppStore,
  getReadinessScore,
  getReadinessState,
  type CapabilityBet,
  type CapabilityBetStatus,
  type CapabilityTimelineEvent,
  type Idea,
  type Note,
  type ReadinessState,
  type SignalEvent,
} from '../store';
import { cn } from '../lib/utils';

const STATE_ORDER: ReadinessState[] = ['Incubating', 'Warming', 'Close', 'Ready'];

const STATE_STYLE: Record<ReadinessState, string> = {
  Incubating: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800',
  Warming: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/30',
  Close: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/30',
  Ready: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30',
};

const BET_STATUS_STYLE: Record<CapabilityBetStatus, string> = {
  watching: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-800',
  exploring: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/30',
  preparing: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-900/30',
  committed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30',
};

type CapabilityBetDraft = {
  title: string;
  thesis: string;
  baselineConviction: number;
  thresholdToCommit: number;
  keywordsText: string;
  unlockPathsText: string;
  firstUseCasesText: string;
  costOfNotKnowing: string;
  reviewCadence: string;
  strategicNote: string;
};

type GraphNoteNode = {
  note: Note;
  event: SignalEvent;
};

type GraphIdeaNode = {
  idea: Idea;
  relation: 'base-skill' | 'umbrella-goal' | 'idea';
  linkedNoteIds: string[];
};

type GraphEdge = {
  noteId: string;
  ideaId: string;
};

function isIncubationCandidate(idea: Idea) {
  return idea.type === 'Project' || !!idea.strategicRole || !!idea.activationReadiness || !!idea.baseSkillIds?.length || !!idea.umbrellaGoalIds?.length;
}

function getIdeaReadiness(idea: Idea) {
  const score = idea.activationReadiness ? getReadinessScore(idea.activationReadiness) : idea.maturity;
  return {
    score,
    state: getReadinessState(score),
  };
}

function createCapabilityBetDraft(bet?: CapabilityBet): CapabilityBetDraft {
  return {
    title: bet?.title ?? '',
    thesis: bet?.thesis ?? '',
    baselineConviction: bet?.baselineConviction ?? bet?.conviction ?? 50,
    thresholdToCommit: bet?.thresholdToCommit ?? 80,
    keywordsText: (bet?.keywords ?? []).join(', '),
    unlockPathsText: (bet?.unlockPaths ?? []).join('\n'),
    firstUseCasesText: (bet?.firstUseCases ?? []).join('\n'),
    costOfNotKnowing: bet?.costOfNotKnowing ?? '',
    reviewCadence: bet?.reviewCadence ?? '',
    strategicNote: bet?.strategicNote ?? '',
  };
}

function parseCommaList(value: string, maxItems = 12) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function parseLineList(value: string, maxItems = 8) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildCapabilityGraphData(bet: CapabilityBet | null, notes: Note[], ideas: Idea[], signalEvents: SignalEvent[]) {
  if (!bet) {
    return {
      noteNodes: [] as GraphNoteNode[],
      ideaNodes: [] as GraphIdeaNode[],
      edges: [] as GraphEdge[],
    };
  }

  const noteById = new Map(notes.map((note) => [note.id, note]));
  const relatedEvents = signalEvents
    .filter((event) => event.capabilityBetId === bet.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const noteNodes = relatedEvents
    .map((event) => {
      const note = noteById.get(event.noteId);
      return note ? { note, event } : null;
    })
    .filter(Boolean) as GraphNoteNode[];

  const ideaMap = new Map<string, GraphIdeaNode>();
  const edges: GraphEdge[] = [];

  for (const { note } of noteNodes) {
    const relatedBaseSkills = note.signalAssessment?.relatedBaseSkillIds ?? [];
    const relatedUmbrellaGoals = note.signalAssessment?.relatedUmbrellaGoalIds ?? [];
    const relatedIdeas = note.signalAssessment?.relatedIdeaIds ?? [];

    const candidates: Array<{ ideaId: string; relation: GraphIdeaNode['relation'] }> = [
      ...relatedBaseSkills.map((ideaId) => ({ ideaId, relation: 'base-skill' as const })),
      ...relatedUmbrellaGoals.map((ideaId) => ({ ideaId, relation: 'umbrella-goal' as const })),
      ...relatedIdeas.map((ideaId) => ({ ideaId, relation: 'idea' as const })),
    ];

    for (const candidate of candidates) {
      const idea = ideas.find((entry) => entry.id === candidate.ideaId);
      if (!idea) continue;

      const existing = ideaMap.get(idea.id);
      if (existing) {
        existing.linkedNoteIds = Array.from(new Set([...existing.linkedNoteIds, note.id]));
      } else {
        ideaMap.set(idea.id, {
          idea,
          relation: candidate.relation,
          linkedNoteIds: [note.id],
        });
      }

      edges.push({ noteId: note.id, ideaId: idea.id });
    }
  }

  return {
    noteNodes,
    ideaNodes: [...ideaMap.values()],
    edges,
  };
}

function getTimelineColor(delta: number) {
  if (delta > 0) return 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-900/40';
  if (delta < 0) return 'text-rose-600 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/20 dark:border-rose-900/40';
  return 'text-stone-500 bg-stone-50 border-stone-200 dark:text-stone-300 dark:bg-stone-900 dark:border-stone-700';
}

function getSignalColor(polarity: SignalEvent['polarity']) {
  if (polarity === 'supports') return '#10b981';
  if (polarity === 'contradicts') return '#ef4444';
  return '#f59e0b';
}

function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="text-xs text-stone-500 dark:text-stone-400">No history yet.</div>;

  const width = 220;
  const height = 56;
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - minValue) / range) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="#0ea5e9"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {values.map((value, index) => {
        const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
        const y = height - ((value - minValue) / range) * (height - 12) - 6;
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="3.5" fill="#0ea5e9" />;
      })}
    </svg>
  );
}

function CapabilityGraphView({
  bet,
  noteNodes,
  ideaNodes,
  edges,
  focusNoteId,
  focusIdeaId,
}: {
  bet: CapabilityBet | null;
  noteNodes: GraphNoteNode[];
  ideaNodes: GraphIdeaNode[];
  edges: GraphEdge[];
  focusNoteId: string | null;
  focusIdeaId: string | null;
}) {
  if (!bet) {
    return (
      <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50/60 p-8 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-900/20 dark:text-stone-400">
        Create or select a capability bet to open the relationship graph.
      </div>
    );
  }

  const center = { x: 280, y: 170 };
  const notePositions = noteNodes.map((entry, index) => {
    const spread = noteNodes.length <= 1 ? 0.5 : index / (noteNodes.length - 1);
    const angle = Math.PI * (0.72 + spread * 0.56);
    return {
      ...entry,
      x: center.x + Math.cos(angle) * 190,
      y: center.y + Math.sin(angle) * 132,
    };
  });
  const ideaPositions = ideaNodes.map((entry, index) => {
    const spread = ideaNodes.length <= 1 ? 0.5 : index / (ideaNodes.length - 1);
    const angle = -Math.PI * (0.22 - spread * 0.44);
    return {
      ...entry,
      x: center.x + Math.cos(angle) * 190,
      y: center.y + Math.sin(angle) * 132,
    };
  });
  const notePositionMap = new Map(notePositions.map((entry) => [entry.note.id, entry]));
  const ideaPositionMap = new Map(ideaPositions.map((entry) => [entry.idea.id, entry]));

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300">
            <Waypoints className="h-3.5 w-3.5" />
            graph view
          </div>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{bet.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Notes connect into the bet through evidence polarity, then branch back out into linked ideas and strategic context.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Notes</div>
            <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{noteNodes.length}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Ideas</div>
            <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{ideaNodes.length}</div>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-stone-800 dark:bg-stone-950/40">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Edges</div>
            <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{noteNodes.length + edges.length}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-3xl border border-stone-200 bg-stone-50/80 p-4 dark:border-stone-800 dark:bg-stone-950/40">
        <svg viewBox="0 0 560 340" className="min-w-[560px]">
          {edges.map((edge) => {
            const noteNode = notePositionMap.get(edge.noteId);
            const ideaNode = ideaPositionMap.get(edge.ideaId);
            if (!noteNode || !ideaNode) return null;
            return (
              <line
                key={`${edge.noteId}-${edge.ideaId}`}
                x1={noteNode.x}
                y1={noteNode.y}
                x2={ideaNode.x}
                y2={ideaNode.y}
                stroke="#8b5cf6"
                strokeOpacity="0.28"
                strokeWidth="2"
              />
            );
          })}

          {notePositions.map((entry) => (
            <line
              key={`${entry.note.id}-bet`}
              x1={entry.x}
              y1={entry.y}
              x2={center.x}
              y2={center.y}
              stroke={getSignalColor(entry.event.polarity)}
              strokeOpacity="0.72"
              strokeWidth={Math.max(2, entry.event.weight / 22)}
              strokeLinecap="round"
            />
          ))}

          <circle cx={center.x} cy={center.y} r="48" fill="#0f172a" />
          <text x={center.x} y={center.y - 6} textAnchor="middle" fill="white" fontSize="12" fontWeight="700" letterSpacing="1.8">
            BET
          </text>
          <text x={center.x} y={center.y + 14} textAnchor="middle" fill="white" fontSize="14" fontWeight="600">
            {bet.title.slice(0, 22)}
          </text>

          {notePositions.map((entry) => {
            const focused = focusNoteId === entry.note.id;
            return (
              <g key={entry.note.id}>
                <circle
                  cx={entry.x}
                  cy={entry.y}
                  r={focused ? 28 : 24}
                  fill="white"
                  stroke={getSignalColor(entry.event.polarity)}
                  strokeWidth={focused ? 4 : 3}
                />
                <text x={entry.x} y={entry.y - 4} textAnchor="middle" fill="#0f172a" fontSize="9" fontWeight="700" letterSpacing="1.2">
                  {entry.event.polarity.toUpperCase()}
                </text>
                <text x={entry.x} y={entry.y + 12} textAnchor="middle" fill="#475569" fontSize="10">
                  {entry.note.content.split('\n')[0].slice(0, 18)}
                </text>
              </g>
            );
          })}

          {ideaPositions.map((entry) => {
            const focused = focusIdeaId === entry.idea.id;
            return (
              <g key={entry.idea.id}>
                <rect
                  x={entry.x - (focused ? 44 : 40)}
                  y={entry.y - 22}
                  width={focused ? 88 : 80}
                  height={44}
                  rx={18}
                  fill="white"
                  stroke={entry.relation === 'base-skill' ? '#8b5cf6' : entry.relation === 'umbrella-goal' ? '#0ea5e9' : '#475569'}
                  strokeWidth={focused ? 4 : 3}
                />
                <text x={entry.x} y={entry.y - 4} textAnchor="middle" fill="#0f172a" fontSize="9" fontWeight="700" letterSpacing="1.2">
                  {entry.relation.toUpperCase()}
                </text>
                <text x={entry.x} y={entry.y + 12} textAnchor="middle" fill="#475569" fontSize="10">
                  {entry.idea.title.slice(0, 18)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Connected notes</div>
          <div className="space-y-3">
            {noteNodes.length ? noteNodes.slice(0, 5).map(({ note, event }) => (
              <Link
                key={note.id}
                to={`/inbox?note=${note.id}`}
                className="block rounded-2xl border border-white/80 bg-white/90 px-4 py-3 transition-colors hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-stone-700"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                  <span style={{ color: getSignalColor(event.polarity) }}>{event.polarity}</span>
                  <span>weight {event.weight}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{event.summary}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                No note relationships have been accepted into this bet yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
          <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Connected ideas</div>
          <div className="space-y-3">
            {ideaNodes.length ? ideaNodes.slice(0, 5).map(({ idea, relation, linkedNoteIds }) => (
              <Link
                key={idea.id}
                to={`/ideas/${idea.id}`}
                className="block rounded-2xl border border-white/80 bg-white/90 px-4 py-3 transition-colors hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/60 dark:hover:border-stone-700"
              >
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                  <span>{relation}</span>
                  <span>{linkedNoteIds.length} linked note{linkedNoteIds.length === 1 ? '' : 's'}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100">{idea.title}</div>
                <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{idea.summary}</p>
              </Link>
            )) : (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                This bet has not been tied back into any ideas or strategic artifacts yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IncubationPage() {
  const navigate = useNavigate();
  const {
    ideas,
    notes,
    projects,
    capabilityBets,
    signalEvents,
    capabilityTimelineEvents,
    addCapabilityBet,
    updateCapabilityBet,
    archiveCapabilityBet,
    addProject,
    updateIdea,
  } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusIdeaId = searchParams.get('idea');
  const focusNoteId = searchParams.get('note');
  const focusBetId = searchParams.get('bet');
  const activeCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !bet.archivedAt), [capabilityBets]);
  const archivedCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !!bet.archivedAt), [capabilityBets]);
  const selectedCapabilityBet = activeCapabilityBets.find((bet) => bet.id === focusBetId) ?? activeCapabilityBets[0] ?? null;
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>(selectedCapabilityBet ? 'edit' : 'create');
  const [editingBetId, setEditingBetId] = useState<string | null>(selectedCapabilityBet?.id ?? null);
  const [draft, setDraft] = useState<CapabilityBetDraft>(createCapabilityBetDraft(selectedCapabilityBet ?? undefined));

  useEffect(() => {
    if (editorMode === 'edit' && selectedCapabilityBet) {
      setEditingBetId(selectedCapabilityBet.id);
      setDraft(createCapabilityBetDraft(selectedCapabilityBet));
      return;
    }

    if (editorMode === 'edit' && !selectedCapabilityBet) {
      setEditorMode('create');
      setEditingBetId(null);
      setDraft(createCapabilityBetDraft());
    }
  }, [editorMode, selectedCapabilityBet]);

  const activatedProjectIds = useMemo(() => new Set(projects.map((p) => p.sourceIdeaId).filter(Boolean)), [projects]);

  const incubationIdeas = ideas
    .filter((idea) => idea.stage !== 'Archived' && isIncubationCandidate(idea) && !activatedProjectIds.has(idea.id))
    .map((idea) => {
      const readiness = getIdeaReadiness(idea);
      const linkedSignalNotes = notes.filter((note) => note.signalAssessment?.detected && (
        note.signalAssessment?.relatedIdeaIds?.includes(idea.id) ||
        note.signalAssessment?.relatedBaseSkillIds?.includes(idea.id) ||
        note.signalAssessment?.relatedUmbrellaGoalIds?.includes(idea.id)
      ));

      return {
        idea,
        ...readiness,
        linkedSignalNotes,
        isFocused: focusIdeaId === idea.id,
      };
    })
    .sort((a, b) => STATE_ORDER.indexOf(b.state) - STATE_ORDER.indexOf(a.state) || b.score - a.score);

  const grouped = STATE_ORDER.map((state) => ({
    state,
    items: incubationIdeas.filter((entry) => entry.state === state),
  }));

  const sortedCapabilityBets = activeCapabilityBets
    .map((bet) => ({
      ...bet,
      relatedEvents: signalEvents.filter((event) => event.capabilityBetId === bet.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      history: capabilityTimelineEvents.filter((event) => event.capabilityBetId === bet.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    }))
    .sort((a, b) => b.conviction - a.conviction || b.salience - a.salience);

  const recentTimelineEvents = useMemo(() => {
    const activeIds = new Set(activeCapabilityBets.map((bet) => bet.id));
    const scoped = capabilityTimelineEvents.filter((event) => activeIds.has(event.capabilityBetId));
    const nonBaseline = scoped.filter((event) => event.reason !== 'baseline');
    return (nonBaseline.length ? nonBaseline : scoped)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8);
  }, [activeCapabilityBets, capabilityTimelineEvents]);

  const graphData = useMemo(
    () => buildCapabilityGraphData(selectedCapabilityBet, notes, ideas, signalEvents),
    [selectedCapabilityBet, notes, ideas, signalEvents],
  );

  const selectCapabilityBet = (betId: string) => {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('bet', betId);
      return next;
    });
    const bet = activeCapabilityBets.find((entry) => entry.id === betId);
    if (bet) {
      setEditorMode('edit');
      setEditingBetId(bet.id);
      setDraft(createCapabilityBetDraft(bet));
    }
  };

  const resetEditor = () => {
    setEditorMode('create');
    setEditingBetId(null);
    setDraft(createCapabilityBetDraft());
  };

  const saveCapabilityBet = () => {
    const title = draft.title.trim();
    const thesis = draft.thesis.trim();
    if (!title || !thesis) return;

    const payload = {
      title,
      thesis,
      baselineConviction: draft.baselineConviction,
      thresholdToCommit: draft.thresholdToCommit,
      keywords: parseCommaList(draft.keywordsText, 12),
      unlockPaths: parseLineList(draft.unlockPathsText, 8),
      firstUseCases: parseLineList(draft.firstUseCasesText, 8),
      costOfNotKnowing: draft.costOfNotKnowing.trim(),
      reviewCadence: draft.reviewCadence.trim(),
      strategicNote: draft.strategicNote.trim(),
    };

    if (editorMode === 'edit' && editingBetId) {
      updateCapabilityBet(editingBetId, payload);
      selectCapabilityBet(editingBetId);
      return;
    }

    addCapabilityBet(payload);
    resetEditor();
  };

  const archiveEditingBet = () => {
    if (!editingBetId) return;
    archiveCapabilityBet(editingBetId);
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('bet');
      return next;
    });
    resetEditor();
  };

  const handleActivateProject = (idea: Idea) => {
    if (idea.type !== 'Project') {
      updateIdea(idea.id, { type: 'Project' });
    }
    addProject({
      title: idea.title,
      description: idea.summary || idea.content.slice(0, 200),
      sourceIdeaId: idea.id,
      status: 'Active',
      experiments: [],
    });
    navigate('/projects');
  };

  return (
    <div className="max-w-6xl mx-auto w-full p-8 flex flex-col gap-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/30 dark:bg-violet-900/20 dark:text-violet-300">
            <Radar className="h-3.5 w-3.5" />
            incubation lane
          </div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Incubation & Watchlist</h1>
          <p className="mt-2 max-w-3xl text-stone-500 dark:text-stone-400 text-lg leading-relaxed">
            Directions worth watching, not forcing. This lane is for things warming up through signals, pull, and clarity before they deserve active execution.
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">
          Activate when the stack feels real, roughly <span className="font-semibold text-stone-900 dark:text-stone-100">80% readiness</span>, not just intellectually interesting.
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        {grouped.map(({ state, items }) => (
          <div key={state} className="rounded-3xl border border-stone-200 bg-stone-50/70 p-5 dark:border-stone-800 dark:bg-stone-900/20">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', STATE_STYLE[state])}>{state}</span>
              <span className="text-xs text-stone-500 dark:text-stone-400">{items.length}</span>
            </div>
            <p className="text-sm text-stone-500 dark:text-stone-400 leading-relaxed">
              {state === 'Incubating' && 'Interesting, but still mostly signal material.'}
              {state === 'Warming' && 'A direction is forming and deserves deliberate watching.'}
              {state === 'Close' && 'Something real is emerging, but one or two gaps still matter.'}
              {state === 'Ready' && 'Strong enough to activate into concrete execution when wanted.'}
            </p>
          </div>
        ))}
      </div>

      <section className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-900/30 dark:bg-sky-900/20 dark:text-sky-300">
              <Globe2 className="h-3.5 w-3.5" />
              capability bets
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Capability operating system</h2>
            <p className="mt-2 max-w-3xl text-stone-500 dark:text-stone-400 leading-relaxed">
              Bets are no longer hardcoded watch cards. They now have editable definitions, a visible graph from notes into ideas, and a timeline that records conviction shifts instead of hiding them inside one current number.
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">
            {signalEvents.length} linked signal event{signalEvents.length === 1 ? '' : 's'} across {activeCapabilityBets.length} active bet{activeCapabilityBets.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-5">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300">
                    <PenSquare className="h-3.5 w-3.5" />
                    editable bet manager
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
                    {editorMode === 'edit' && editingBetId ? 'Edit selected bet' : 'Create a new capability bet'}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    Titles, thesis, thresholds, keywords, unlock paths, first use cases, and decision rule now live in the UI and persist through snapshot storage.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                  >
                    <Plus className="h-4 w-4" />
                    New bet
                  </button>
                  {editorMode === 'edit' && editingBetId && (
                    <button
                      type="button"
                      onClick={archiveEditingBet}
                      className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-rose-700 hover:border-rose-300 hover:text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                    >
                      <Archive className="h-4 w-4" />
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <div className="grid gap-3">
                  {activeCapabilityBets.length ? activeCapabilityBets.map((bet) => (
                    <button
                      key={bet.id}
                      type="button"
                      onClick={() => selectCapabilityBet(bet.id)}
                      className={cn(
                        'rounded-2xl border px-4 py-4 text-left transition-colors',
                        selectedCapabilityBet?.id === bet.id
                          ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/20'
                          : 'border-stone-200 bg-stone-50 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950/40 dark:hover:border-stone-700',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{bet.title}</div>
                          <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{bet.conviction}% conviction and {bet.salience}% salience</div>
                        </div>
                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', BET_STATUS_STYLE[bet.status])}>
                          {bet.status}
                        </span>
                      </div>
                    </button>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-5 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950/20 dark:text-stone-400">
                      No active bets yet. Start with one capability that deserves patient evidence tracking.
                    </div>
                  )}
                </div>

                {archivedCapabilityBets.length > 0 && (
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-stone-800 dark:bg-stone-950/40">
                    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Archived bets</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {archivedCapabilityBets.map((bet) => (
                        <span key={bet.id} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                          {bet.title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Title</span>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                      placeholder="Learn Chinese"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Review cadence</span>
                    <input
                      type="text"
                      value={draft.reviewCadence}
                      onChange={(event) => setDraft((current) => ({ ...current, reviewCadence: event.target.value }))}
                      className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                      placeholder="monthly or when new strong signals land"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Thesis</span>
                  <textarea
                    value={draft.thesis}
                    onChange={(event) => setDraft((current) => ({ ...current, thesis: event.target.value }))}
                    className="w-full min-h-[120px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    placeholder="Why is this capability worth watching?"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Baseline conviction</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.baselineConviction}
                      onChange={(event) => setDraft((current) => ({ ...current, baselineConviction: Number(event.target.value) }))}
                      className="w-full"
                    />
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{draft.baselineConviction}% baseline</div>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Commit threshold</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={draft.thresholdToCommit}
                      onChange={(event) => setDraft((current) => ({ ...current, thresholdToCommit: Number(event.target.value) }))}
                      className="w-full"
                    />
                    <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{draft.thresholdToCommit}% to commit</div>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Keywords</span>
                  <input
                    type="text"
                    value={draft.keywordsText}
                    onChange={(event) => setDraft((current) => ({ ...current, keywordsText: event.target.value }))}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    placeholder="chinese, mandarin, china, wechat"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Unlock paths</span>
                    <textarea
                      value={draft.unlockPathsText}
                      onChange={(event) => setDraft((current) => ({ ...current, unlockPathsText: event.target.value }))}
                      className="w-full min-h-[140px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                      placeholder={'direct market reading\nrelationship access'}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">First use cases</span>
                    <textarea
                      value={draft.firstUseCasesText}
                      onChange={(event) => setDraft((current) => ({ ...current, firstUseCasesText: event.target.value }))}
                      className="w-full min-h-[140px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                      placeholder={'read primary-source chatter\nnavigate docs and products'}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Cost of not knowing</span>
                  <textarea
                    value={draft.costOfNotKnowing}
                    onChange={(event) => setDraft((current) => ({ ...current, costOfNotKnowing: event.target.value }))}
                    className="w-full min-h-[96px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    placeholder="What edge gets left on the table if this never gets explored?"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Decision rule</span>
                  <textarea
                    value={draft.strategicNote}
                    onChange={(event) => setDraft((current) => ({ ...current, strategicNote: event.target.value }))}
                    className="w-full min-h-[110px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                    placeholder="What should be true before this bet becomes active commitment?"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={saveCapabilityBet}
                    disabled={!draft.title.trim() || !draft.thesis.trim()}
                    className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {editorMode === 'edit' ? 'Save bet' : 'Create bet'}
                  </button>
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                  >
                    <Sparkles className="h-4 w-4" />
                    Reset form
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900/40">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                    <History className="h-3.5 w-3.5" />
                    calibration timeline
                  </div>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Recent conviction shifts</h3>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                    Every material change now lands as history instead of silently overwriting the previous state.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {recentTimelineEvents.length ? recentTimelineEvents.map((event) => {
                  const bet = capabilityBets.find((entry) => entry.id === event.capabilityBetId);
                  const noteLinks = event.evidenceIds
                    .map((id) => id.split(':').slice(1).join(':'))
                    .map((noteId) => notes.find((note) => note.id === noteId))
                    .filter(Boolean) as Note[];

                  return (
                    <div key={event.id} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{bet?.title ?? 'Capability bet'}</div>
                          <p className="mt-1 text-sm leading-relaxed text-stone-600 dark:text-stone-400">{event.summary}</p>
                        </div>
                        <div className="text-right">
                          <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', getTimelineColor(event.delta))}>
                            {event.delta > 0 ? '+' : ''}{event.delta}
                          </span>
                          <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</div>
                        </div>
                      </div>
                      {noteLinks.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {noteLinks.slice(0, 3).map((note) => (
                            <Link
                              key={note.id}
                              to={`/inbox?note=${note.id}`}
                              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                            >
                              {note.content.split('\n')[0].slice(0, 28)}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-5 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-950/20 dark:text-stone-400">
                    No calibration events yet. As evidence is accepted, this feed will show conviction moves and the notes behind them.
                  </div>
                )}
              </div>
            </div>

            <CapabilityGraphView
              bet={selectedCapabilityBet}
              noteNodes={graphData.noteNodes}
              ideaNodes={graphData.ideaNodes}
              edges={graphData.edges}
              focusNoteId={focusNoteId}
              focusIdeaId={focusIdeaId}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {activeCapabilityBets.map((bet) => (
            <button
              key={bet.id}
              type="button"
              onClick={() => selectCapabilityBet(bet.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] transition-colors',
                selectedCapabilityBet?.id === bet.id
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100',
              )}
            >
              {bet.title}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {sortedCapabilityBets.map((bet) => (
            <article key={bet.id} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900/40">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', BET_STATUS_STYLE[bet.status])}>{bet.status}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">commit at {bet.thresholdToCommit}%</span>
                    <button
                      type="button"
                      onClick={() => selectCapabilityBet(bet.id)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300"
                    >
                      Open graph
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditorMode('edit');
                        setEditingBetId(bet.id);
                        setDraft(createCapabilityBetDraft(bet));
                        selectCapabilityBet(bet.id);
                      }}
                      className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                    >
                      Edit
                    </button>
                  </div>
                  <h3 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{bet.title}</h3>
                  <p className="mt-2 max-w-3xl text-stone-600 dark:text-stone-400 leading-relaxed">{bet.thesis}</p>

                  <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
                    <Metric icon={Target} label="Conviction" value={bet.conviction} />
                    <Metric icon={Radar} label="Salience" value={bet.salience} />
                    <Metric icon={CheckCircle2} label="Supporting" value={bet.supportingSignalIds.length ? Math.min(100, bet.supportingSignalIds.length * 20) : 0} />
                    <Metric icon={AlertTriangle} label="Contrary risk" value={bet.contradictingSignalIds.length ? Math.min(100, bet.contradictingSignalIds.length * 25) : 0} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                    <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                      <span>Strategic commitment threshold</span>
                      <span>{bet.conviction}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                      <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${bet.conviction}%` }} />
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-4 text-sm text-stone-600 dark:text-stone-400">
                      <div><span className="font-medium text-stone-900 dark:text-stone-100">Baseline:</span> {bet.baselineConviction}%</div>
                      <div><span className="font-medium text-stone-900 dark:text-stone-100">Review cadence:</span> {bet.reviewCadence ?? 'not set'}</div>
                      <div><span className="font-medium text-stone-900 dark:text-stone-100">Last evidence:</span> {formatDistanceToNow(new Date(bet.lastReviewed), { addSuffix: true })}</div>
                      <div><span className="font-medium text-stone-900 dark:text-stone-100">If not pursued:</span> {bet.costOfNotKnowing ?? 'n/a'}</div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Unlock paths</div>
                      <ul className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-300">
                        {bet.unlockPaths.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">First use cases</div>
                      <ul className="mt-3 space-y-2 text-sm text-stone-700 dark:text-stone-300">
                        {bet.firstUseCases.map((item) => <li key={item}>- {item}</li>)}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Conviction history</div>
                      <span className="text-xs text-stone-500 dark:text-stone-400">{bet.history.length} event{bet.history.length === 1 ? '' : 's'}</span>
                    </div>
                    <Sparkline values={bet.history.map((entry) => entry.conviction)} />
                    <div className="mt-4 space-y-3">
                      {bet.history.slice(-4).reverse().map((event: CapabilityTimelineEvent) => {
                        const noteLinks = event.evidenceIds
                          .map((id) => id.split(':').slice(1).join(':'))
                          .map((noteId) => notes.find((note) => note.id === noteId))
                          .filter(Boolean) as Note[];
                        return (
                          <div key={event.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/60">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', getTimelineColor(event.delta))}>
                                  {event.delta > 0 ? '+' : ''}{event.delta}
                                </span>
                                <span className="text-xs text-stone-500 dark:text-stone-400">{event.reason}</span>
                              </div>
                              <span className="text-xs text-stone-500 dark:text-stone-400">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
                            </div>
                            <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{event.summary}</p>
                            {noteLinks.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {noteLinks.slice(0, 3).map((note) => (
                                  <Link
                                    key={note.id}
                                    to={`/inbox?note=${note.id}`}
                                    className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 hover:border-stone-300 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-100"
                                  >
                                    {note.content.split('\n')[0].slice(0, 28)}
                                  </Link>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {!!bet.relatedEvents?.length && (
                    <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                        <GitBranch className="h-3.5 w-3.5" />
                        latest linked evidence
                      </div>
                      <div className="space-y-3">
                        {bet.relatedEvents.slice(0, 4).map((event) => (
                          <div key={event.id} className="rounded-2xl border border-sky-100 bg-white/90 px-4 py-3 dark:border-sky-900/30 dark:bg-stone-900/50">
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                              <span>{event.polarity}</span>
                              <span>weight {event.weight}</span>
                              <span>{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
                            </div>
                            <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">{event.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full lg:w-72 shrink-0 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Decision rule</div>
                  <p className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{bet.strategicNote ?? 'Commit only when repeated signals make this economically or strategically real.'}</p>
                  <div className="mt-4 space-y-2 text-sm">
                    <ActionLabel icon={Radar} text={bet.status === 'committed' ? 'Move into active execution' : 'Keep passively monitoring notes'} />
                    <ActionLabel icon={Target} text={bet.status === 'preparing' ? 'Set up study system and first use case' : 'Wait for stronger repeated signals'} />
                    <ActionLabel icon={Sparkles} text={bet.status === 'exploring' ? 'Collect higher-quality evidence' : 'Let weak signals accumulate naturally'} />
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!sortedCapabilityBets.length && (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-stone-500 dark:border-stone-700 dark:bg-stone-900/20 dark:text-stone-400">
              No capability bets yet. Add one above and it will start accumulating evidence through Inbox and Review.
            </div>
          )}
        </div>
      </section>

      <div className="space-y-5">
        {incubationIdeas.map(({ idea, score, state, linkedSignalNotes, isFocused }) => (
          <article key={idea.id} id={`incubation-${idea.id}`} className={cn('rounded-3xl border bg-white p-6 shadow-sm dark:bg-stone-900/40', isFocused ? 'border-violet-400 shadow-lg shadow-violet-900/10 dark:border-violet-500' : 'border-stone-200 dark:border-stone-800')}>
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em]', STATE_STYLE[state])}>{state}</span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">{idea.type}</span>
                  {isFocused && (
                    <button
                      type="button"
                      onClick={() => setSearchParams((params) => {
                        const next = new URLSearchParams(params);
                        next.delete('idea');
                        next.delete('note');
                        return next;
                      })}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-300"
                    >
                      Focused
                    </button>
                  )}
                  {idea.strategicRole && (
                    <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/30 dark:bg-violet-900/20 dark:text-violet-300">{idea.strategicRole}</span>
                  )}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{idea.title}</h2>
                <p className="mt-2 max-w-3xl text-stone-600 dark:text-stone-400 leading-relaxed">{idea.summary}</p>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric icon={BrainCircuit} label="Base strength" value={idea.activationReadiness?.baseStrength} />
                  <Metric icon={Radar} label="Market signal" value={idea.activationReadiness?.marketSignal} />
                  <Metric icon={Heart} label="Personal pull" value={idea.activationReadiness?.personalPull} />
                  <Metric icon={Coins} label="Monetization clarity" value={idea.activationReadiness?.monetizationClarity} />
                </div>

                <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                    <span>Activation readiness</span>
                    <span>{score}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${score}%` }} />
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-3 text-sm text-stone-600 dark:text-stone-400">
                    <div>
                      <span className="font-medium text-stone-900 dark:text-stone-100">Why warming up:</span>{' '}
                      {linkedSignalNotes.length ? `${linkedSignalNotes.length} linked signal note${linkedSignalNotes.length > 1 ? 's' : ''}` : 'mostly thesis, still sparse signal support'}
                    </div>
                    <div>
                      <span className="font-medium text-stone-900 dark:text-stone-100">What missing:</span>{' '}
                      {score >= 80 ? 'activation decision' : score >= 65 ? 'one concrete entry point' : score >= 40 ? 'stronger evidence or clearer use case' : 'more signal, pull, or monetization clarity'}
                    </div>
                    <div>
                      <span className="font-medium text-stone-900 dark:text-stone-100">Last reviewed:</span>{' '}
                      {formatDistanceToNow(new Date(idea.lastReviewed), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                {linkedSignalNotes.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/40 dark:bg-violet-950/20">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:text-violet-300">Linked signal notes</div>
                        <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">Jump back to the raw signal that is warming this direction up.</div>
                      </div>
                      {focusNoteId && linkedSignalNotes.some((note) => note.id === focusNoteId) && (
                        <Link
                          to={`/inbox?note=${focusNoteId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                        >
                          Open focused note <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                    <div className="space-y-3">
                      {linkedSignalNotes.slice(0, 3).map((note) => {
                        const isFocusedNote = focusNoteId === note.id;
                        return (
                          <div
                            key={note.id}
                            className={cn('rounded-2xl border px-4 py-3', isFocusedNote ? 'border-violet-300 bg-white dark:border-violet-700 dark:bg-stone-900' : 'border-violet-100 bg-white/80 dark:border-violet-900/30 dark:bg-stone-900/40')}
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                              <span>{note.signalAssessment?.direction ?? 'Signal'}</span>
                              <span>strength {note.signalAssessment?.strength ?? 0}/10</span>
                              <span>confidence {note.signalAssessment?.confidence ?? 0}/10</span>
                            </div>
                            <p className="line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">{note.content}</p>
                            <Link
                              to={`/inbox?note=${note.id}`}
                              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-900 dark:text-violet-300 dark:hover:text-violet-100"
                            >
                              Open in Inbox <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="w-full lg:w-64 shrink-0 rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Incubation Controls</div>
                
                <label className="block mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">incubation posture</span>
                  <select
                    value={idea.incubationDecision || 'watch'}
                    onChange={(e) => updateIdea(idea.id, { incubationDecision: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <option value="watch">👀 Keep Watching</option>
                    <option value="explore">🔍 Warm Up / Explore</option>
                    <option value="park">⏸️ Parked / Defer</option>
                    <option value="ready">✅ Ready to Activate</option>
                  </select>
                </label>

                <label className="block mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">review cadence</span>
                  <input
                    type="text"
                    value={idea.reviewCadence || ''}
                    onChange={(e) => updateIdea(idea.id, { reviewCadence: e.target.value })}
                    placeholder="e.g. monthly, weekly"
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">next action</span>
                  <input
                    type="text"
                    value={idea.nextAction || ''}
                    onChange={(e) => updateIdea(idea.id, { nextAction: e.target.value })}
                    placeholder="What is the next step?"
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                </label>

                <label className="block mt-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">strategic posture note</span>
                  <textarea
                    value={idea.strategicNote || ''}
                    onChange={(e) => updateIdea(idea.id, { strategicNote: e.target.value })}
                    placeholder="Decision rules or strategic criteria..."
                    rows={3}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 leading-relaxed resize-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleActivateProject(idea)}
                  className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-white transition-all active:scale-95 shadow-sm hover:shadow"
                >
                  <GitBranch className="h-4 w-4" />
                  Activate as Project
                </button>

                <div className="mt-4 border-t border-stone-200 dark:border-stone-800 pt-3">
                  <Link to={`/ideas/${idea.id}`} className="inline-flex items-center gap-2 text-xs font-semibold text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors">
                    Open full artifact <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </article>
        ))}

        {!incubationIdeas.length && (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-stone-500 dark:border-stone-700 dark:bg-stone-900/20 dark:text-stone-400">
            No incubation items yet. Promote strategic ideas here once they deserve watching without forcing execution.
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof BrainCircuit; label: string; value?: number }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">{typeof value === 'number' ? `${value}%` : 'n/a'}</div>
    </div>
  );
}

function ActionLabel({ icon: Icon, text }: { icon: typeof Sparkles; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
      <Icon className="mt-0.5 h-4 w-4 text-stone-400 dark:text-stone-500" />
      <span>{text}</span>
    </div>
  );
}
