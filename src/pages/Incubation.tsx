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
  X,
  Brain,
  Wand2,
  SendHorizonal,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { askGemma } from '../lib/ai';
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

const REFLECTION_PROMPTS = [
  "What is a recurring tension or contradiction in your raw notes this week?",
  "What capability are you avoiding committing to, and what is the real reason?",
  "Which idea has the highest pull but zero next actions?",
  "What pattern is repeating in your observations that you haven't named yet?",
  "What assumption are you making that has the least evidence supporting it?",
];

function isReviewOverdue(lastReviewed: string, cadence?: string): boolean {
  if (!lastReviewed) return true;
  const lastDate = new Date(lastReviewed);
  const diffDays = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
  const lower = (cadence || '').toLowerCase();
  
  let threshold = 30; // default is 30 days (monthly)
  if (lower.includes('bi-week') || lower.includes('biweekly') || lower.includes('2 week') || lower.includes('fortnight')) {
    threshold = 14;
  } else if (lower.includes('week')) {
    threshold = 7;
  } else if (lower.includes('month')) {
    threshold = 30;
  }
  return diffDays > threshold;
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
    addNote,
    addIdea,
  } = useAppStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusIdeaId = searchParams.get('idea');
  const focusNoteId = searchParams.get('note');
  const focusBetId = searchParams.get('bet');
  const activatedBetIds = useMemo(() => new Set(projects.map((p) => p.sourceBetId).filter(Boolean)), [projects]);
  const activeCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !bet.archivedAt && !activatedBetIds.has(bet.id)), [capabilityBets, activatedBetIds]);
  const archivedCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !!bet.archivedAt), [capabilityBets]);
  const selectedCapabilityBet = activeCapabilityBets.find((bet) => bet.id === focusBetId) ?? activeCapabilityBets[0] ?? null;
  const [editorMode, setEditorMode] = useState<'create' | 'edit'>(selectedCapabilityBet ? 'edit' : 'create');
  const [editingBetId, setEditingBetId] = useState<string | null>(selectedCapabilityBet?.id ?? null);
  const [draft, setDraft] = useState<CapabilityBetDraft>(createCapabilityBetDraft(selectedCapabilityBet ?? undefined));

  const [promptIndex, setPromptIndex] = useState(0);
  const [reflectionText, setReflectionText] = useState('');
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [selectedInsight, setSelectedInsight] = useState<Idea | null>(null);
  const [justDumped, setJustDumped] = useState(false);
  const [showNewBetForm, setShowNewBetForm] = useState(false);

  // Bet creation chat state
  type BetChatMsg = { role: 'assistant' | 'user'; content: string };
  const [betChatMessages, setBetChatMessages] = useState<BetChatMsg[]>([]);
  const [betChatInput, setBetChatInput] = useState('');
  const [isBetChatLoading, setIsBetChatLoading] = useState(false);
  const [betChatMode, setBetChatMode] = useState<'create' | 'edit'>('create');
  const [betChatParsed, setBetChatParsed] = useState<Partial<CapabilityBetDraft> | null>(null);
  const [betChatSaving, setBetChatSaving] = useState(false);

  const BET_CHAT_SYSTEM = `You are a strategic capability advisor helping a user define or refine a "capability bet" — a skill, domain, or strategic area worth patiently tracking.

Your job is to gather the following information through friendly, concise conversation (one question at a time):
1. Title (short, precise capability name)
2. Thesis (2-3 sentences: why does this matter strategically?)
3. Baseline conviction (0-100%: how convinced are they right now?)
4. Commit threshold (0-100%: at what conviction level should they commit?)
5. Keywords (comma-separated terms to match in notes)
6. Unlock paths (concrete steps that would develop this capability)
7. First use cases (real applications once they have it)
8. Cost of not knowing (what risk or opportunity cost comes from ignoring this?)
9. Decision rule (what condition should trigger full commitment?)
10. Review cadence (how often to revisit: weekly, monthly, etc.)

Rules:
- Ask ONE question at a time, naturally
- Be conversational, not clinical — like a smart advisor, not a form
- Accept vague answers and help clarify
- When you have enough for ALL fields (even rough values), output a summary and then the JSON block EXACTLY like this with no other text after it:

<BET_JSON>
{"title":"...","thesis":"...","baselineConviction":30,"thresholdToCommit":80,"keywordsText":"...","unlockPathsText":"...","firstUseCasesText":"...","costOfNotKnowing":"...","strategicNote":"...","reviewCadence":"..."}
</BET_JSON>

Do NOT output the JSON until you have collected enough for all fields. Output it only ONCE at the very end.`;

  const openBetChat = (mode: 'create' | 'edit', existingBet?: CapabilityBet) => {
    setBetChatMode(mode);
    setBetChatParsed(null);
    setBetChatInput('');
    setShowNewBetForm(true);
    if (mode === 'edit' && existingBet) {
      setEditingBetId(existingBet.id);
      setDraft(createCapabilityBetDraft(existingBet));
      const context = `Existing bet to refine:\nTitle: ${existingBet.title}\nThesis: ${existingBet.thesis}\nKeywords: ${(existingBet.keywords ?? []).join(', ')}\nBaseline conviction: ${existingBet.baselineConviction}%\nCommit threshold: ${existingBet.thresholdToCommit}%\nReview cadence: ${existingBet.reviewCadence || 'not set'}\nDecision rule: ${existingBet.strategicNote || 'not set'}`;
      setBetChatMessages([
        { role: 'assistant', content: `I can see your bet on **${existingBet.title}**. What would you like to change or improve? You can tell me in plain language and I’ll update the fields for you.` },
      ]);
      void (async () => {
        // no auto-call, wait for user
      })();
    } else {
      resetEditor();
      setEditorMode('create');
      setEditingBetId(null);
      setBetChatMessages([
        { role: 'assistant', content: `Let’s define your new capability bet. What capability or domain do you want to start tracking? (e.g. “Learning Mandarin”, “AI agent product design”, “Physical asset business”)` },
      ]);
    }
  };

  const sendBetChatMessage = async () => {
    const text = betChatInput.trim();
    if (!text || isBetChatLoading) return;
    setBetChatInput('');
    const userMsg: BetChatMsg = { role: 'user', content: text };
    const nextMessages = [...betChatMessages, userMsg];
    setBetChatMessages(nextMessages);
    setIsBetChatLoading(true);
    try {
      // Build prompt from history
      const history = nextMessages.map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content}`).join('\n\n');
      const raw = await askGemma(history, BET_CHAT_SYSTEM);

      // Check for JSON extraction
      const jsonMatch = raw.match(/<BET_JSON>([\s\S]*?)<\/BET_JSON>/);
      let displayContent = raw.replace(/<BET_JSON>[\s\S]*?<\/BET_JSON>/, '').trim();

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim()) as Partial<CapabilityBetDraft>;
          setBetChatParsed(parsed);
          setDraft(prev => ({ ...prev, ...parsed }));
          if (!displayContent) displayContent = `✓ I’ve filled in all the fields. Review the summary below and click **Save Bet** when ready, or tell me what to change.`;
        } catch {
          // parse failed, continue chat
        }
      }

      setBetChatMessages(prev => [...prev, { role: 'assistant', content: displayContent || raw }]);
    } catch (err) {
      setBetChatMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsBetChatLoading(false);
    }
  };

  // AI Bet Scout state
  type ScoutedBet = {
    id: string;
    title: string;
    thesis: string;
    keywords: string[];
    unlockPaths: string[];
    firstUseCases: string[];
    costOfNotKnowing: string;
    reasoning: string;
  };
  const [scoutedBets, setScoutedBets] = useState<ScoutedBet[]>([]);
  const [isScouting, setIsScouting] = useState(false);
  const [scoutError, setScoutError] = useState<string | null>(null);

  const handleScoutBets = async () => {
    setIsScouting(true);
    setScoutError(null);
    setScoutedBets([]);
    try {
      const existingTitles = capabilityBets.filter(b => !b.archivedAt).map(b => b.title).join(', ');
      const notesSample = notes.slice(0, 50).map(n => `- ${n.content.slice(0, 120)}`).join('\n');
      const ideasSample = ideas.slice(0, 30).map(i => `- ${i.title}: ${i.summary?.slice(0, 100) || ''}`).join('\n');
      const goalsSample = useAppStore.getState().goals.map(g => `- ${g.title}: ${g.description?.slice(0, 80) || ''}`).join('\n');

      const prompt = `You are a strategic capability advisor. Based on the user's personal knowledge vault, identify 3 to 5 capability bets they should formally track but haven't yet.

A capability bet is a specific skill, domain, or strategic area worth patiently developing and monitoring for market/personal signals.

Existing bets (DO NOT suggest duplicates): ${existingTitles || 'none yet'}

Recent raw notes:
${notesSample || '(none)'}

Strategic ideas:
${ideasSample || '(none)'}

Goals:
${goalsSample || '(none)'}

Rules:
- Suggest only bets NOT already tracked above
- Each bet must be grounded in actual patterns from their notes/ideas, not generic advice
- Be specific, not vague ("Conversational AI Product Design" not "Learn AI")
- Return ONLY valid JSON — no markdown, no explanation outside the JSON

Return this exact JSON format:
[
  {
    "title": "Short precise bet name",
    "thesis": "2-3 sentence strategic case for why this capability matters now",
    "keywords": ["keyword1", "keyword2", "keyword3"],
    "unlockPaths": ["First concrete step", "Second step"],
    "firstUseCases": ["First real application", "Second application"],
    "costOfNotKnowing": "What the user risks by ignoring this",
    "reasoning": "One sentence citing specific evidence from their notes/ideas"
  }
]`;

      const systemInstruction = 'You are a strategic capability advisor. Always return only valid JSON arrays. No markdown code blocks, no commentary outside JSON.';
      const raw = await askGemma(prompt, systemInstruction);

      // Strip possible markdown code fences
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned) as Omit<ScoutedBet, 'id'>[];
      const withIds = parsed.map((b, i) => ({ ...b, id: `scout-${Date.now()}-${i}` }));
      setScoutedBets(withIds);
    } catch (err) {
      console.error(err);
      setScoutError(err instanceof Error ? err.message : 'Scout failed. Try again.');
    } finally {
      setIsScouting(false);
    }
  };

  const handleAcceptScoutedBet = (bet: ScoutedBet) => {
    addCapabilityBet({
      title: bet.title,
      thesis: bet.thesis,
      keywords: bet.keywords,
      unlockPaths: bet.unlockPaths,
      firstUseCases: bet.firstUseCases,
      costOfNotKnowing: bet.costOfNotKnowing,
      baselineConviction: 30,
      thresholdToCommit: 80,
      reviewCadence: 'monthly',
    });
    setScoutedBets(prev => prev.filter(b => b.id !== bet.id));
  };

  const handleDismissScoutedBet = (id: string) => {
    setScoutedBets(prev => prev.filter(b => b.id !== id));
  };

  const handleDumpToInbox = () => {
    if (!reflectionText.trim()) return;
    const promptText = REFLECTION_PROMPTS[promptIndex];
    addNote(`[Subconscious Prompt: ${promptText}]\n\n${reflectionText.trim()}`);
    setReflectionText('');
    setJustDumped(true);
    setTimeout(() => setJustDumped(false), 3000);
  };

  const handleTriggerSynthesis = async () => {
    setIsSynthesizing(true);
    setSynthesisError(null);
    try {
      const prompt = `Analyze the following raw notes and ideas from my subconscious vault.
Identify recent orbits (what topics I'm circling), contradictions, cognitive tensions, and avoided topics.
Synthesize this into a beautiful, structured markdown report.

Here are my recent raw notes:
${notes.slice(0, 40).map(n => `- [${n.createdAt}] ${n.content}`).join('\n')}

Here are my current strategic ideas:
${ideas.filter(i => isIncubationCandidate(i)).map(i => `- ${i.title}: ${i.summary || i.content.slice(0, 150)}`).join('\n')}

Synthesize this into a structured report with:
- **Subconscious Orbits**: Themes appearing repeatedly.
- **Cognitive Tensions & Contradictions**: Where my notes suggest one thing but my ideas suggest another, or internal contradictions.
- **Avoided Patterns**: Areas of high strategic value that I seem to be avoiding or deferring.
- **Postures & Recommendations**: Strategic advice on capability bets to warm up or ideas to activate.

Return the markdown report. Be direct, insightful, and clear.`;

      const systemInstruction = "You are the HumanBoard Subconscious Synthesis Engine. You analyze raw notes and ideas to find hidden cognitive patterns, orbits, tensions, and avoided topics. Respond in clean, elegant Markdown.";
      
      const response = await askGemma(prompt, systemInstruction);
      
      addIdea({
        title: `Subconscious Synthesis - ${new Date().toLocaleDateString()}`,
        summary: 'AI-synthesized report analyzing cognitive orbits, tensions, and avoided patterns across the vault.',
        content: response,
        type: 'Reference',
        stage: 'Evergreen',
        confidence: 8,
        maturity: 90,
        linkedNoteIds: [],
        relatedIdeaIds: [],
        tags: ['Insight', 'Subconscious'],
      });
    } catch (err) {
      console.error(err);
      setSynthesisError(err instanceof Error ? err.message : 'Failed to generate synthesis.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const recentInsights = useMemo(() => {
    return ideas
      .filter((i) => i.type === 'Reference' && i.tags?.includes('Insight') && i.tags?.includes('Subconscious'))
      .sort((a, b) => b.lastReviewed.localeCompare(a.lastReviewed));
  }, [ideas]);

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

      {/* Subconscious Insight Engine */}
      <section className="relative overflow-hidden rounded-3xl border border-violet-200/50 bg-gradient-to-br from-violet-500/10 via-stone-50/50 to-stone-50/50 p-6 shadow-sm dark:border-violet-900/30 dark:from-violet-950/10 dark:via-stone-950/50 dark:to-stone-950/50">
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="absolute left-0 bottom-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-sky-400/10 blur-3xl" />
        
        <div className="relative flex items-center justify-between gap-4 border-b border-stone-200/60 pb-5 dark:border-stone-800/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              <Brain className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Subconscious Insight Engine</h2>
              <p className="text-sm text-stone-500 dark:text-stone-400">Capture daily reflections and synthesize raw signals into high-conviction insights.</p>
            </div>
          </div>
        </div>

        <div className="relative mt-6 grid gap-6 md:grid-cols-2">
          {/* Daily Reflection prompt carousel */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white/70 p-5 backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/40">
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-400">Daily Reflection Loop</span>
                <button
                  type="button"
                  onClick={() => setPromptIndex((prev) => (prev + 1) % REFLECTION_PROMPTS.length)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100 transition-colors"
                >
                  Next Prompt →
                </button>
              </div>
              <p className="mt-3 text-base font-medium text-stone-950 dark:text-stone-100 italic">
                "{REFLECTION_PROMPTS[promptIndex]}"
              </p>
              <textarea
                value={reflectionText}
                onChange={(e) => setReflectionText(e.target.value)}
                placeholder="Capture your subconscious response here..."
                rows={3}
                className="mt-4 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 resize-none"
              />
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {justDumped && '✓ Dumped reflection to inbox!'}
              </span>
              <button
                type="button"
                onClick={handleDumpToInbox}
                disabled={!reflectionText.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 hover:bg-stone-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
              >
                <PenSquare className="h-4 w-4" />
                Dump to Inbox
              </button>
            </div>
          </div>

          {/* AI Synthesis Trigger */}
          <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white/70 p-5 backdrop-blur-sm dark:border-stone-800 dark:bg-stone-900/40">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-400">AI Synthesis Core</span>
              <p className="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                Run synthesis to parse recent raw note signals, orbits, and contradictions. Saves a structured report as an Evergreen Reference Idea.
              </p>
              
              {synthesisError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
                  ⚠️ {synthesisError}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleTriggerSynthesis}
                disabled={isSynthesizing}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white transition-all disabled:opacity-75"
              >
                {isSynthesizing ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Synthesizing connections...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Trigger Insight Synthesis
                  </>
                )}
              </button>

              {recentInsights.length > 0 && (
                <div className="border-t border-stone-200 dark:border-stone-800 pt-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Recent Insights</span>
                  <div className="mt-2 max-h-[120px] overflow-y-auto space-y-2 pr-1">
                    {recentInsights.map((insight) => (
                      <button
                        key={insight.id}
                        type="button"
                        onClick={() => setSelectedInsight(insight)}
                        className="w-full flex items-center justify-between gap-3 text-left rounded-xl border border-stone-100 hover:border-stone-200 bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-950/40 dark:text-stone-300 dark:hover:text-stone-100 transition-colors"
                      >
                        <span className="truncate">{insight.title}</span>
                        <span className="text-[9px] text-stone-400 dark:text-stone-500 whitespace-nowrap">
                          {formatDistanceToNow(new Date(insight.lastReviewed), { addSuffix: true })}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
        <div className="flex flex-wrap items-end justify-between gap-4">
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
          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-600 shadow-sm dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-300">
              {signalEvents.length} linked signal event{signalEvents.length === 1 ? '' : 's'} across {activeCapabilityBets.length} active bet{activeCapabilityBets.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={() => openBetChat('create')}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition-all hover:bg-emerald-100 hover:shadow dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
            >
              <Plus className="h-4 w-4" />
              New Bet
            </button>
            <button
              type="button"
              onClick={handleScoutBets}
              disabled={isScouting}
              className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 shadow-sm transition-all hover:bg-violet-100 hover:shadow disabled:opacity-60 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300"
            >
              {isScouting ? (
                <><BrainCircuit className="h-4 w-4 animate-pulse" />Scouting…</>
              ) : (
                <><Wand2 className="h-4 w-4" />Scout Bets</>
              )}
            </button>
          </div>
        </div>

        {/* ── All bets overview cards ── */}
        {capabilityBets.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {capabilityBets
              .slice()
              .sort((a, b) => {
                if (!!a.archivedAt !== !!b.archivedAt) return a.archivedAt ? 1 : -1;
                return b.conviction - a.conviction;
              })
              .map((bet) => {
                const isArchived = !!bet.archivedAt;
                const isSelected = selectedCapabilityBet?.id === bet.id;
                const overdue = !isArchived && isReviewOverdue(bet.lastReviewed, bet.reviewCadence);
                const supportCount = bet.supportingSignalIds.length;
                const contradictCount = bet.contradictingSignalIds.length;

                return (
                  <button
                    key={bet.id}
                    type="button"
                    onClick={() => !isArchived && selectCapabilityBet(bet.id)}
                    className={cn(
                      'group text-left rounded-2xl border p-4 transition-all duration-150 focus:outline-none',
                      isArchived
                        ? 'border-stone-200 bg-stone-50/60 opacity-60 cursor-default dark:border-stone-800 dark:bg-stone-900/20'
                        : isSelected
                        ? 'border-sky-400 bg-sky-50 shadow-md dark:border-sky-500 dark:bg-sky-950/20'
                        : 'border-stone-200 bg-white hover:border-sky-300 hover:shadow-sm dark:border-stone-800 dark:bg-stone-900/40 dark:hover:border-sky-700',
                    )}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] shrink-0',
                          isArchived
                            ? 'bg-stone-100 text-stone-500 border-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:border-stone-700'
                            : BET_STATUS_STYLE[bet.status],
                        )}
                      >
                        {isArchived ? 'archived' : bet.status}
                      </span>
                      {overdue && (
                        <span title="Review overdue">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug line-clamp-2 mb-3">
                      {bet.title}
                    </div>

                    {/* Conviction bar */}
                    <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      <span>Conviction</span>
                      <span className="text-stone-600 dark:text-stone-300">{bet.conviction}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden mb-3">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          bet.conviction >= bet.thresholdToCommit
                            ? 'bg-emerald-500'
                            : bet.conviction >= 60
                            ? 'bg-sky-500'
                            : bet.conviction >= 40
                            ? 'bg-amber-400'
                            : 'bg-stone-400',
                        )}
                        style={{ width: `${bet.conviction}%` }}
                      />
                    </div>

                    {/* Signal counts */}
                    <div className="flex items-center gap-3 text-[10px] text-stone-500 dark:text-stone-400">
                      {supportCount > 0 && (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="h-3 w-3" />
                          {supportCount}
                        </span>
                      )}
                      {contradictCount > 0 && (
                        <span className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-semibold">
                          <AlertTriangle className="h-3 w-3" />
                          {contradictCount}
                        </span>
                      )}
                      <span className="ml-auto truncate">
                        {formatDistanceToNow(new Date(bet.lastReviewed), { addSuffix: true })}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        )}

        {/* Scout error */}
        {scoutError && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
            <span>{scoutError}</span>
            <button type="button" onClick={() => setScoutError(null)} className="shrink-0 text-rose-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
          </div>
        )}

        {/* Scouted draft bet cards */}
        {scoutedBets.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-400">
              <Wand2 className="h-3.5 w-3.5" />
              AI Suggested Bets — review and accept any that resonate
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {scoutedBets.map((bet) => (
                <div
                  key={bet.id}
                  className="relative flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/40 dark:bg-violet-950/10"
                >
                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={() => handleDismissScoutedBet(bet.id)}
                    className="absolute top-3 right-3 p-0.5 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                    aria-label="Dismiss suggestion"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {/* Status chip */}
                  <span className="inline-flex w-fit rounded-full border border-violet-300 bg-white px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-violet-600 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300">
                    AI suggestion
                  </span>

                  {/* Title */}
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-100 leading-snug pr-5">
                    {bet.title}
                  </div>

                  {/* Thesis */}
                  <p className="text-xs leading-relaxed text-stone-600 dark:text-stone-400 line-clamp-3">
                    {bet.thesis}
                  </p>

                  {/* Reasoning chip */}
                  <div className="rounded-xl border border-violet-100 bg-white/70 px-3 py-2 text-[10px] text-violet-700 dark:border-violet-900/30 dark:bg-violet-950/20 dark:text-violet-300 leading-relaxed">
                    <span className="font-bold uppercase tracking-wider mr-1">Why:</span>{bet.reasoning}
                  </div>

                  {/* Keywords */}
                  {bet.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {bet.keywords.slice(0, 5).map(k => (
                        <span key={k} className="rounded-full border border-stone-200 bg-white px-2 py-0.5 text-[9px] font-medium text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Accept */}
                  <button
                    type="button"
                    onClick={() => handleAcceptScoutedBet(bet)}
                    className="mt-auto flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white transition-all active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to Watchlist
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Bet creation / editing chat ── */}
        {showNewBetForm && (
          <div className="rounded-2xl border border-emerald-200 bg-white dark:bg-stone-900/60 dark:border-emerald-900/30 shadow-sm overflow-hidden">
            {/* Chat header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-100 dark:border-stone-800 bg-emerald-50/60 dark:bg-emerald-950/10">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                    {betChatMode === 'edit' ? `Editing: ${draft.title || 'bet'}` : 'New Capability Bet'}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider">AI-guided conversation</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {betChatParsed && (
                  <button type="button"
                    disabled={betChatSaving}
                    onClick={async () => { setBetChatSaving(true); saveCapabilityBet(); setShowNewBetForm(false); setBetChatMessages([]); setBetChatParsed(null); setBetChatSaving(false); }}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-colors disabled:opacity-60">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {betChatMode === 'edit' ? 'Save changes' : 'Save bet'}
                  </button>
                )}
                {betChatMode === 'edit' && editingBetId && (
                  <button type="button" onClick={archiveEditingBet}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:bg-rose-50 dark:border-rose-900/30 dark:bg-transparent dark:text-rose-400">
                    <Archive className="h-3 w-3" /> Archive
                  </button>
                )}
                <button type="button"
                  onClick={() => { setShowNewBetForm(false); setBetChatMessages([]); setBetChatParsed(null); if (betChatMode === 'create') resetEditor(); }}
                  className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Parsed draft preview strip */}
            {betChatParsed && (
              <div className="px-5 py-3 bg-emerald-50/40 dark:bg-emerald-950/10 border-b border-emerald-100 dark:border-emerald-900/20 flex flex-wrap gap-3 text-xs">
                {draft.title && <span className="font-semibold text-stone-900 dark:text-stone-100">{draft.title}</span>}
                {betChatParsed.baselineConviction !== undefined && <span className="text-stone-500 dark:text-stone-400">Conviction: <b className="text-stone-700 dark:text-stone-300">{betChatParsed.baselineConviction}%</b></span>}
                {betChatParsed.thresholdToCommit !== undefined && <span className="text-stone-500 dark:text-stone-400">Commit at: <b className="text-stone-700 dark:text-stone-300">{betChatParsed.thresholdToCommit}%</b></span>}
                {betChatParsed.reviewCadence && <span className="text-stone-500 dark:text-stone-400">Cadence: <b className="text-stone-700 dark:text-stone-300">{betChatParsed.reviewCadence}</b></span>}
                {betChatParsed.keywordsText && <span className="text-stone-500 dark:text-stone-400">Keywords: <b className="text-stone-700 dark:text-stone-300">{betChatParsed.keywordsText.slice(0, 40)}</b></span>}
              </div>
            )}

            {/* Messages */}
            <div className="flex flex-col gap-4 p-5 max-h-80 overflow-y-auto">
              {betChatMessages.map((msg, i) => (
                <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-stone-900 dark:bg-stone-800 text-white rounded-br-sm'
                      : 'bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-sm'
                  )}>
                    {msg.content.split('**').map((part, pi) =>
                      pi % 2 === 1 ? <strong key={pi}>{part}</strong> : <span key={pi}>{part}</span>
                    )}
                  </div>
                </div>
              ))}
              {isBetChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-stone-100 dark:bg-stone-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="flex gap-2 px-5 pb-5">
              <input
                type="text"
                value={betChatInput}
                onChange={e => setBetChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendBetChatMessage(); } }}
                placeholder="Type your answer…"
                className="flex-1 rounded-xl border border-stone-200 bg-stone-50 dark:bg-stone-950 dark:border-stone-700 px-4 py-2.5 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:focus:ring-emerald-500/20"
                disabled={isBetChatLoading}
              />
              <button
                type="button"
                onClick={() => void sendBetChatMessage()}
                disabled={!betChatInput.trim() || isBetChatLoading}
                className="flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2.5 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SendHorizonal className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Selected bet detail panel (single, shown on card click) ── */}
        {selectedCapabilityBet && (() => {
          const bet = selectedCapabilityBet;
          const betHistory = capabilityTimelineEvents
            .filter(e => e.capabilityBetId === bet.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const betSignalEvents = signalEvents
            .filter(e => e.capabilityBetId === bet.id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const betGraphData = buildCapabilityGraphData(bet, notes, ideas, signalEvents);

          // Auto-connect notes by keyword match
          const betKeywords = (bet.keywords ?? []).map(k => k.toLowerCase());
          const autoConnectedNotes = betKeywords.length > 0
            ? notes.filter(n =>
                betKeywords.some(kw => n.content.toLowerCase().includes(kw)) &&
                !betSignalEvents.some(e => e.noteId === n.id)
              ).slice(0, 6)
            : [];

          return (
            <div className="rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900/40 overflow-hidden">
              {/* Panel header */}
              <div className="flex flex-wrap items-start justify-between gap-4 p-5 border-b border-stone-100 dark:border-stone-800">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em]', BET_STATUS_STYLE[bet.status])}>
                      {bet.status}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                      commit at {bet.thresholdToCommit}%
                    </span>
                    {isReviewOverdue(bet.lastReviewed, bet.reviewCadence) && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" /> Overdue
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{bet.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-500 dark:text-stone-400 max-w-2xl">{bet.thesis}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button"
                    onClick={() => openBetChat('edit', bet)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 transition-colors">
                    <PenSquare className="h-3 w-3" /> Edit
                  </button>
                  <button type="button"
                    onClick={() => { updateCapabilityBet(bet.id, { status: 'committed' }); addProject({ title: bet.title, description: `Thesis: ${bet.thesis}\n\nUnlock Paths:\n${bet.unlockPaths.map(p => `- ${p}`).join('\n')}\n\nFirst Use Cases:\n${bet.firstUseCases.map(u => `- ${u}`).join('\n')}`, sourceBetId: bet.id, status: 'Active' }); navigate('/projects'); }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300 transition-colors">
                    <GitBranch className="h-3 w-3" /> Activate
                  </button>
                  <button type="button"
                    onClick={() => setSearchParams(p => { const n = new URLSearchParams(p); n.delete('bet'); return n; })}
                    className="p-1.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors" aria-label="Close panel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* ── Row 1: 4 metrics ── */}
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Metric icon={Target} label="Conviction" value={bet.conviction} />
                  <Metric icon={Radar} label="Salience" value={bet.salience} />
                  <Metric icon={CheckCircle2} label="Supporting" value={bet.supportingSignalIds.length ? Math.min(100, bet.supportingSignalIds.length * 20) : 0} />
                  <Metric icon={AlertTriangle} label="Contrary" value={bet.contradictingSignalIds.length ? Math.min(100, bet.contradictingSignalIds.length * 25) : 0} />
                </div>

                {/* ── Row 2: Balanced Grid layout ── */}
                <div className="grid gap-5 lg:grid-cols-2">
                  {/* Left Column: Conviction bar + Overdue action + History + Signals + Auto-notes */}
                  <div className="space-y-4">
                    {/* Conviction bar */}
                    <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
                        <span>Progress to commit</span>
                        <span className="text-stone-600 dark:text-stone-300">{bet.conviction}% / {bet.thresholdToCommit}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', bet.conviction >= bet.thresholdToCommit ? 'bg-emerald-500' : bet.conviction >= 60 ? 'bg-sky-500' : bet.conviction >= 40 ? 'bg-amber-400' : 'bg-stone-400')}
                          style={{ width: `${Math.min(100, (bet.conviction / bet.thresholdToCommit) * 100)}%` }} />
                      </div>
                      <div className="mt-3 grid gap-2 grid-cols-2 md:grid-cols-4 text-xs text-stone-500 dark:text-stone-400">
                        <div><span className="font-semibold text-stone-700 dark:text-stone-300">Baseline:</span> {bet.baselineConviction}%</div>
                        <div><span className="font-semibold text-stone-700 dark:text-stone-300">Cadence:</span> {bet.reviewCadence || 'not set'}</div>
                        <div><span className="font-semibold text-stone-700 dark:text-stone-300">Last reviewed:</span> {formatDistanceToNow(new Date(bet.lastReviewed), { addSuffix: true })}</div>
                        <div><span className="font-semibold text-stone-700 dark:text-stone-300">Cost of skip:</span> {bet.costOfNotKnowing || 'n/a'}</div>
                      </div>
                    </div>

                    {/* Overdue action */}
                    {isReviewOverdue(bet.lastReviewed, bet.reviewCadence) && (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                        <div className="flex items-center gap-2 font-medium">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          Review overdue — {formatDistanceToNow(new Date(bet.lastReviewed), { addSuffix: true })}
                        </div>
                        <button type="button" onClick={() => updateCapabilityBet(bet.id, { lastReviewed: new Date().toISOString() })}
                          className="rounded-xl bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition-colors shrink-0">
                          Mark Reviewed
                        </button>
                      </div>
                    )}

                    {/* Conviction history */}
                    <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                        <span className="flex items-center gap-2"><History className="h-3.5 w-3.5" /> Conviction history</span>
                        <span>{betHistory.length} event{betHistory.length === 1 ? '' : 's'}</span>
                      </div>
                      <Sparkline values={betHistory.map(e => e.conviction)} />
                      <div className="mt-4 space-y-2">
                        {betHistory.slice(-4).reverse().map((event: CapabilityTimelineEvent) => {
                          const noteLinks = event.evidenceIds
                            .map(id => id.split(':').slice(1).join(':'))
                            .map(nid => notes.find(n => n.id === nid))
                            .filter(Boolean) as Note[];
                          return (
                            <div key={event.id} className="rounded-xl border border-stone-200 bg-white/90 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900/60">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', getTimelineColor(event.delta))}>
                                    {event.delta > 0 ? '+' : ''}{event.delta}
                                  </span>
                                  <span className="text-xs text-stone-500 dark:text-stone-400">{event.reason}</span>
                                </div>
                                <span className="text-[10px] text-stone-400 dark:text-stone-500">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
                              </div>
                              <p className="mt-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">{event.summary}</p>
                              {noteLinks.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {noteLinks.slice(0, 3).map(note => (
                                    <Link key={note.id} to={`/inbox?note=${note.id}`}
                                      className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-600 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                                      {note.content.split('\n')[0].slice(0, 24)}…
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Linked evidence */}
                    {betSignalEvents.length > 0 && (
                      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">
                          <GitBranch className="h-3.5 w-3.5" />
                          Linked evidence ({betSignalEvents.length})
                        </div>
                        <div className="space-y-2">
                          {betSignalEvents.slice(0, 5).map(event => (
                            <div key={event.id} className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-900/40">
                              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider mt-0.5',
                                event.polarity === 'supports' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300'
                                : event.polarity === 'contradicts' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300'
                                : 'border-stone-200 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300')}>
                                {event.polarity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-stone-700 dark:text-stone-300 leading-relaxed line-clamp-2">{event.summary}</p>
                                <div className="mt-1 text-[10px] text-stone-400 dark:text-stone-500">weight {event.weight} · {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auto-connected notes */}
                    {autoConnectedNotes.length > 0 && (
                      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 dark:border-sky-900/30 dark:bg-sky-950/10">
                        <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-400">
                          <BrainCircuit className="h-3.5 w-3.5" />
                          Auto-connected notes ({autoConnectedNotes.length}) — matched by keywords
                        </div>
                        <div className="space-y-2">
                          {autoConnectedNotes.map(note => (
                            <Link key={note.id} to={`/inbox?note=${note.id}`}
                              className="flex items-start gap-2 rounded-xl border border-sky-100 bg-white/80 px-3 py-2 text-xs text-stone-700 hover:border-sky-300 hover:shadow-sm transition-all dark:border-sky-900/20 dark:bg-stone-900/40 dark:text-stone-300">
                              <ArrowRight className="h-3 w-3 mt-0.5 text-sky-500 shrink-0" />
                              <span className="line-clamp-2">{note.content.split('\n')[0].slice(0, 120)}</span>
                              <span className="ml-auto shrink-0 text-stone-400">{formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Decision rule + Keywords + Unlock paths + First use cases + Graph view */}
                  <div className="space-y-4">
                    {/* Decision rule */}
                    <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 mb-2">Decision rule</div>
                      <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                        {bet.strategicNote || 'Commit only when repeated signals make this economically or strategically real.'}
                      </p>
                      <div className="mt-4 space-y-2">
                        <ActionLabel icon={Radar} text={bet.status === 'committed' ? 'Move into active execution' : 'Keep passively monitoring notes'} />
                        <ActionLabel icon={Target} text={bet.status === 'preparing' ? 'Set up study system and first use case' : 'Wait for stronger repeated signals'} />
                        <ActionLabel icon={Sparkles} text={bet.status === 'exploring' ? 'Collect higher-quality evidence' : 'Let weak signals accumulate naturally'} />
                      </div>
                    </div>

                    {/* Keywords */}
                    {(bet.keywords ?? []).length > 0 && (
                      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 mb-2">Keywords</div>
                        <div className="flex flex-wrap gap-1.5">
                          {bet.keywords.map(k => (
                            <span key={k} className="rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-xs text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">{k}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Unlock paths */}
                    {(bet.unlockPaths ?? []).length > 0 && (
                      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 mb-2">Unlock paths</div>
                        <ul className="space-y-1.5">
                          {bet.unlockPaths.map(item => <li key={item} className="text-xs text-stone-700 dark:text-stone-300 flex items-start gap-1.5"><span className="text-stone-400 mt-0.5">–</span>{item}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* First use cases */}
                    {(bet.firstUseCases ?? []).length > 0 && (
                      <div className="rounded-2xl border border-stone-100 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-950/40">
                        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500 mb-2">First use cases</div>
                        <ul className="space-y-1.5">
                          {bet.firstUseCases.map(item => <li key={item} className="text-xs text-stone-700 dark:text-stone-300 flex items-start gap-1.5"><span className="text-stone-400 mt-0.5">–</span>{item}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Graph view */}
                    <CapabilityGraphView
                      bet={bet}
                      noteNodes={betGraphData.noteNodes}
                      ideaNodes={betGraphData.ideaNodes}
                      edges={betGraphData.edges}
                      focusNoteId={focusNoteId}
                      focusIdeaId={focusIdeaId}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Empty state */}
        {!selectedCapabilityBet && activeCapabilityBets.length === 0 && !showNewBetForm && (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center text-stone-500 dark:border-stone-700 dark:bg-stone-900/20 dark:text-stone-400">
            No capability bets yet. Click <strong>New Bet</strong> above to start tracking your first capability.
          </div>
        )}

        {!selectedCapabilityBet && activeCapabilityBets.length > 0 && !showNewBetForm && (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/50 px-4 py-5 text-center text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-950/20 dark:text-stone-500">
            Click any bet card above to see its full detail panel.
          </div>
        )}
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

                {isReviewOverdue(idea.lastReviewed, idea.reviewCadence) && (
                  <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300">
                    <div className="flex items-center gap-1.5 font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>⚠️ Review Overdue ({formatDistanceToNow(new Date(idea.lastReviewed), { addSuffix: true })})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateIdea(idea.id, { lastReviewed: new Date().toISOString() })}
                      className="rounded-xl bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white transition-colors"
                    >
                      Mark Reviewed
                    </button>
                  </div>
                )}

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

      {/* Premium Detail Modal for Insights */}
      {selectedInsight && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="relative w-full max-w-3xl rounded-3xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-900 flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4 dark:border-stone-800">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/30 dark:bg-violet-900/20 dark:text-violet-300">
                  Subconscious Synthesis
                </div>
                <h3 className="mt-1.5 text-lg font-semibold text-stone-900 dark:text-stone-100">{selectedInsight.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInsight(null)}
                className="rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-950 dark:hover:bg-stone-800 dark:hover:text-stone-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-stone-750 dark:text-stone-300 leading-relaxed whitespace-pre-wrap select-text selection:bg-violet-100 dark:selection:bg-violet-900/40">
              {selectedInsight.content}
            </div>

            <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 dark:border-stone-800">
              <span className="text-xs text-stone-400 dark:text-stone-500">
                Created {new Date(selectedInsight.lastReviewed).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={() => setSelectedInsight(null)}
                className="rounded-xl bg-stone-900 hover:bg-stone-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
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
