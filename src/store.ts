import { create } from 'zustand';
import { defaultSections } from './lib/storage/defaultSnapshot';
import { localSnapshotRepository, type SaveResult } from './lib/storage/localSnapshotRepository';
import type { AppSnapshot, ChatMessage, ChatThread } from './lib/storage/types';

export type SignalDirection = 'Supports' | 'Weakens' | 'Mixed' | 'Unclear';
export type PredictionHorizon = 'Near' | 'Mid' | 'Long';
export type StrategicRole = 'Base' | 'Vehicle' | 'Signal' | 'Question';
export type ReadinessState = 'Incubating' | 'Warming' | 'Close' | 'Ready';

export type SignalAssessment = {
  detected: boolean;
  strength: number; // 1-10
  confidence: number; // 1-10
  direction: SignalDirection;
  horizon: PredictionHorizon;
  thesis?: string;
  whyItMatters?: string;
  relatedBaseSkillIds?: string[];
  relatedUmbrellaGoalIds?: string[];
  relatedIdeaIds?: string[];
};

export type ActivationReadiness = {
  baseStrength: number; // 0-100
  marketSignal: number; // 0-100
  personalPull: number; // 0-100
  monetizationClarity: number; // 0-100
  timing: number; // 0-100
};

export type Note = {
  id: string;
  content: string;
  createdAt: string;
  layer: 'raw';
  signalAssessment?: SignalAssessment;
  capabilityBetIds?: string[];
  capabilityEvidencePolarity?: EvidencePolarity;
  capabilityEvidenceSummary?: string;
  extractionReview?: NoteExtractionReview;
};

export type IdeaStage = 'Seed' | 'Sprouting' | 'Evergreen' | 'Archived';

export type IdeaType = 'Concept' | 'Principle' | 'Reference' | 'Project' | 'Question' | 'Action' | 'Base Skill' | 'Umbrella Goal';

export function getReadinessScore(readiness: ActivationReadiness): number {
  return Math.round(
    (readiness.baseStrength +
      readiness.marketSignal +
      readiness.personalPull +
      readiness.monetizationClarity +
      readiness.timing) / 5,
  );
}

export function getReadinessState(score: number): ReadinessState {
  if (score >= 80) return 'Ready';
  if (score >= 65) return 'Close';
  if (score >= 40) return 'Warming';
  return 'Incubating';
}

export function deriveStrategicIdeaFields(ideas: Idea[], notes: Note[]): Idea[] {
  const signalNotes = notes.filter((note) => note.signalAssessment?.detected);

  return ideas.map((idea) => {
    const isBaseIdea = idea.type === 'Base Skill' || idea.strategicRole === 'Base';
    const isIncubationCandidate = idea.type === 'Project' || !!idea.strategicRole || !!idea.activationReadiness || !!idea.baseSkillIds?.length || !!idea.umbrellaGoalIds?.length;

    if (!isBaseIdea && !isIncubationCandidate) return idea;

    let updatedIdea = { ...idea };
    let changed = false;

    if (isBaseIdea) {
      const supportingNotes = signalNotes.filter((note) => {
        const assessment = note.signalAssessment;
        return assessment && assessment.direction === 'Supports' && (
          assessment.relatedBaseSkillIds?.includes(idea.id) ||
          assessment.relatedIdeaIds?.includes(idea.id)
        );
      });

      const weakeningNotes = signalNotes.filter((note) => {
        const assessment = note.signalAssessment;
        return assessment && assessment.direction === 'Weakens' && (
          assessment.relatedBaseSkillIds?.includes(idea.id) ||
          assessment.relatedIdeaIds?.includes(idea.id)
        );
      });

      const weightedSupport = supportingNotes.reduce((sum, note) => sum + ((note.signalAssessment?.strength ?? 0) * (note.signalAssessment?.confidence ?? 0)), 0);
      const weightedWeakening = weakeningNotes.reduce((sum, note) => sum + ((note.signalAssessment?.strength ?? 0) * (note.signalAssessment?.confidence ?? 0)), 0);
      const rawAlignment = 50 + (weightedSupport * 0.8) - (weightedWeakening * 0.8);
      const alignmentScore = Math.max(0, Math.min(100, Math.round(rawAlignment)));
      const supportingNoteIds = supportingNotes.map((note) => note.id);
      const weakeningNoteIds = weakeningNotes.map((note) => note.id);

      if (
        idea.alignmentScore !== alignmentScore ||
        JSON.stringify(idea.supportingNoteIds ?? []) !== JSON.stringify(supportingNoteIds) ||
        JSON.stringify(idea.weakeningNoteIds ?? []) !== JSON.stringify(weakeningNoteIds)
      ) {
        updatedIdea.alignmentScore = alignmentScore;
        updatedIdea.supportingNoteIds = supportingNoteIds;
        updatedIdea.weakeningNoteIds = weakeningNoteIds;
        changed = true;
      }
    }

    if (isIncubationCandidate) {
      const supportingNotes = signalNotes.filter((note) => {
        const assessment = note.signalAssessment;
        return assessment && assessment.direction === 'Supports' && (
          assessment.relatedIdeaIds?.includes(idea.id) ||
          assessment.relatedBaseSkillIds?.includes(idea.id) ||
          assessment.relatedUmbrellaGoalIds?.includes(idea.id)
        );
      });

      const weakeningNotes = signalNotes.filter((note) => {
        const assessment = note.signalAssessment;
        return assessment && assessment.direction === 'Weakens' && (
          assessment.relatedIdeaIds?.includes(idea.id) ||
          assessment.relatedBaseSkillIds?.includes(idea.id) ||
          assessment.relatedUmbrellaGoalIds?.includes(idea.id)
        );
      });

      const weightedSupport = supportingNotes.reduce((sum, note) => sum + ((note.signalAssessment?.strength ?? 0) * (note.signalAssessment?.confidence ?? 0)), 0);
      const weightedWeakening = weakeningNotes.reduce((sum, note) => sum + ((note.signalAssessment?.strength ?? 0) * (note.signalAssessment?.confidence ?? 0)), 0);
      const computedSignal = Math.max(0, Math.min(100, Math.round(50 + (weightedSupport * 0.5) - (weightedWeakening * 0.5))));

      if (idea.activationReadiness) {
        if (idea.activationReadiness.marketSignal !== computedSignal) {
          updatedIdea.activationReadiness = {
            ...idea.activationReadiness,
            marketSignal: computedSignal,
          };
          changed = true;
        }
      } else {
        if (idea.maturity !== computedSignal) {
          updatedIdea.maturity = computedSignal;
          changed = true;
        }
      }
    }

    return changed ? updatedIdea : idea;
  });
}

export interface Comment {
  id: string;
  selectedText: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export type Section = {
  id: string;
  name: string;
  color: string;
};

export type Idea = {
  id: string;
  title: string;
  summary: string;
  content: string;
  layer: 'knowledge';
  type: IdeaType;
  stage: IdeaStage;
  sectionId?: string;
  sectionIds?: string[];
  confidence: number; // 1-10
  maturity: number; // 0-100
  nextAction?: string;
  lastReviewed: string;
  linkedNoteIds: string[];
  relatedIdeaIds: string[];
  tags?: string[];
  sourceNoteExcerpt?: string;
  compileReason?: string;
  openQuestions?: string[];
  coverImage?: string;
  comments?: Comment[];
  strategicRole?: StrategicRole;
  baseSkillIds?: string[];
  umbrellaGoalIds?: string[];
  activationReadiness?: ActivationReadiness;
  strategicNote?: string;
  alignmentScore?: number; // 0-100
  supportingNoteIds?: string[];
  weakeningNoteIds?: string[];
  incubationDecision?: string;
  reviewCadence?: string;
};

export type ProjectUpdateEntry = {
  id: string;
  content: string;
  createdAt: string;
};

export type ProjectTask = {
  id: string;
  content: string;
  completed: boolean;
};

export type Project = {
  id: string;
  title: string;
  description: string;
  sourceIdeaId?: string;
  sourceBetId?: string;
  goalId?: string;
  status: 'Active' | 'Paused' | 'Blocked' | 'Completed';
  nextAction?: string;
  definitionOfDone?: string;
  dueDate?: string;
  createdAt: string;
  lastUpdatedAt: string;
  linkedNoteIds: string[];
  linkedIdeaIds: string[];
  linkedGoalIds: string[];
  tasks: ProjectTask[];
  updates: ProjectUpdateEntry[];
  experiments: Experiment[];
};

export type Experiment = {
  id: string;
  title: string;
  status: 'Planned' | 'Running' | 'Concluded';
  result?: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string;
  status: 'Active' | 'Paused' | 'Completed';
  createdAt: string;
  roadmap?: {
    knowledge: string[];
    ideas: string[];
    todos: string[];
  };
};

export type FusionType = 'Post' | 'Writing' | 'Thesis' | 'Report';

export type FusionStatus = 'Draft' | 'Synthesizing' | 'Ready' | 'Completed';

export type FusionAudience = 'Personal' | 'Team' | 'Public' | 'Client';

export type FusionChecklist = {
  title: boolean;
  summary: boolean;
  centralConclusion: boolean;
  supportingLinks: boolean;
  body: boolean;
  audience: boolean;
};

export type FusionItem = {
  id: string;
  title: string;
  type: FusionType;
  status: FusionStatus;
  summary: string;
  centralConclusion: string;
  body: string;
  audience: FusionAudience;
  linkedNoteIds: string[];
  linkedIdeaIds: string[];
  linkedGoalIds: string[];
  linkedProjectIds: string[];
  shareReadiness: number;
  checklist: FusionChecklist;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  isPublic?: boolean;
  authorName?: string;
  authorBio?: string;
};

export type FusionSuggestion = {
  id: string;
  title: string;
  type: FusionType;
  thesis: string;
  reasoning: string;
  linkedNoteIds: string[];
  linkedIdeaIds: string[];
  readinessScore: number;
};

export function computeFusionChecklist(item: Partial<FusionItem>): FusionChecklist {
  return {
    title: !!item.title?.trim(),
    summary: !!item.summary?.trim(),
    centralConclusion: !!item.centralConclusion?.trim(),
    supportingLinks:
      !!item.linkedNoteIds?.length ||
      !!item.linkedIdeaIds?.length ||
      !!item.linkedGoalIds?.length ||
      !!item.linkedProjectIds?.length,
    body: !!item.body?.trim(),
    audience: !!item.audience,
  };
}

export function computeFusionReadiness(checklist: FusionChecklist): number {
  const values = Object.values(checklist);
  return Math.round((values.filter(Boolean).length / values.length) * 100);
}

export type ReflectionFeedback = 'useful' | 'not-useful';

export type Reflection = {
  id: string;
  pattern: string;
  question: string;
  suggestion: string;
  sourceNoteIds: string[];
  sourceIdeaIds: string[];
  createdAt: string;
  dismissedAt?: string;
  feedback?: ReflectionFeedback;
};

export type EvidencePolarity = 'supports' | 'contradicts' | 'complicates';
export type CapabilityBetStatus = 'watching' | 'exploring' | 'preparing' | 'committed';
export type ExtractionCandidateStatus = 'pending' | 'accepted' | 'rejected';
export type ExtractionReviewSource = 'ai' | 'heuristic' | 'hybrid';

export type CapabilityEvidenceCandidate = {
  id: string;
  capabilityBetId: string;
  title: string;
  polarity: EvidencePolarity;
  summary: string;
  rationale: string;
  suggestedWeight: number;
  status: ExtractionCandidateStatus;
};

export type IdeaLinkCandidateRelation = 'base-skill' | 'umbrella-goal' | 'idea';

export type IdeaLinkCandidate = {
  id: string;
  ideaId: string;
  title: string;
  relation: IdeaLinkCandidateRelation;
  rationale: string;
  status: ExtractionCandidateStatus;
};

export type NoteExtractionReview = {
  source: ExtractionReviewSource;
  generatedAt: string;
  themes: string[];
  entities: string[];
  capabilityCandidates: CapabilityEvidenceCandidate[];
  ideaCandidates: IdeaLinkCandidate[];
};

export type SignalEvent = {
  id: string;
  noteId: string;
  capabilityBetId: string;
  polarity: EvidencePolarity;
  weight: number;
  summary: string;
  createdAt: string;
};

export type CapabilityBet = {
  id: string;
  title: string;
  thesis: string;
  baselineConviction: number;
  status: CapabilityBetStatus;
  conviction: number;
  thresholdToCommit: number;
  salience: number;
  keywords: string[];
  supportingSignalIds: string[];
  contradictingSignalIds: string[];
  complicatingSignalIds: string[];
  lastReviewed: string;
  unlockPaths: string[];
  firstUseCases: string[];
  costOfNotKnowing?: string;
  reviewCadence?: string;
  strategicNote?: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};

export type CapabilityTimelineEventReason = 'baseline' | 'signal-change' | 'manual-edit';

export type CapabilityTimelineEvent = {
  id: string;
  capabilityBetId: string;
  createdAt: string;
  reason: CapabilityTimelineEventReason;
  previousConviction: number;
  conviction: number;
  delta: number;
  previousStatus: CapabilityBetStatus;
  status: CapabilityBetStatus;
  salience: number;
  evidenceIds: string[];
  summary: string;
};

interface AppState {
  notes: Note[];
  ideas: Idea[];
  projects: Project[];
  fusionItems: FusionItem[];
  sections: Section[];
  goals: Goal[];
  reflections: Reflection[];
  capabilityBets: CapabilityBet[];
  signalEvents: SignalEvent[];
  capabilityTimelineEvents: CapabilityTimelineEvent[];
  isDarkMode: boolean;
  chatMessages: ChatMessage[];
  chatThreads: ChatThread[];
  activeThreadId: string;
  lastPersistError: string | null;
  lastPersistAt: string | null;
  persistRetry: () => Promise<void>;
  clearPersistError: () => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setChatThreads: (threads: ChatThread[]) => void;
  setActiveThreadId: (id: string) => void;
  createChatThread: (title?: string) => string;
  deleteChatThread: (id: string) => void;
  renameChatThread: (id: string, title: string) => void;
  addNote: (content: string) => void;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  addIdea: (idea: Omit<Idea, 'id' | 'lastReviewed' | 'layer'>) => void;
  updateIdea: (id: string, updates: Partial<Idea>) => void;
  deleteIdea: (id: string) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'lastUpdatedAt' | 'linkedNoteIds' | 'linkedIdeaIds' | 'linkedGoalIds' | 'tasks' | 'updates' | 'experiments'> & Partial<Pick<Project, 'createdAt' | 'lastUpdatedAt' | 'linkedNoteIds' | 'linkedIdeaIds' | 'linkedGoalIds' | 'tasks' | 'updates' | 'experiments'>>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addFusionItem: (item: Omit<FusionItem, 'id' | 'createdAt' | 'updatedAt' | 'shareReadiness' | 'checklist'>) => string;
  updateFusionItem: (id: string, updates: Partial<FusionItem>) => void;
  deleteFusionItem: (id: string) => void;
  addSection: (section: Omit<Section, 'id'>) => string;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => void;
  updateGoal: (id: string, updates: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  addReflection: (reflection: Omit<Reflection, 'id' | 'createdAt'>) => Reflection;
  updateReflection: (id: string, updates: Partial<Reflection>) => void;
  dismissReflection: (id: string) => void;
  setReflectionFeedback: (id: string, feedback: ReflectionFeedback) => void;
  setIdeas: (ideas: Idea[]) => void;
  addCapabilityBet: (bet: {
    title: string;
    thesis: string;
    baselineConviction?: number;
    thresholdToCommit?: number;
    keywords?: string[];
    unlockPaths?: string[];
    firstUseCases?: string[];
    costOfNotKnowing?: string;
    reviewCadence?: string;
    strategicNote?: string;
  }) => void;
  updateCapabilityBet: (id: string, updates: Partial<CapabilityBet>) => void;
  archiveCapabilityBet: (id: string) => void;
  recomputeStrategicAlignment: () => void;
  recomputeCapabilityBetSignals: () => void;
  toggleDarkMode: () => void;
  fusionSuggestions: FusionSuggestion[];
  lastDailyFusionScan: string;
  setFusionSuggestions: (suggestions: FusionSuggestion[]) => void;
  setLastDailyFusionScan: (timestamp: string) => void;
  dismissFusionSuggestion: (id: string) => void;
}

const initialNotes: Note[] = [];

const initialSections: Section[] = defaultSections;

const initialIdeas = [
  {
    id: 'i1',
    title: 'Local-First Personal CRM',
    summary: 'A CRM for personal relationships that stores all data locally and uses small on-device models to suggest when to reach out.',
    content: 'People are tired of their personal data being in the cloud. A local-first CRM would sync via peer-to-peer (like CRDTs) and use a local LLM to analyze text messages (with permission) to suggest check-ins. \n\nKey features:\n- No cloud backend required\n- E2E encrypted sync\n- Local inference for "sentiment" analysis on recent interactions.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec1',
    confidence: 7,
    maturity: 45,
    nextAction: 'Research CRDT libraries for React Native',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: ['i5'],
  },
  {
    id: 'i2',
    title: 'AI-Powered Expense Categorizer',
    summary: 'Automatically sort expenses from receipts using vision models.',
    content: 'Instead of manually entering data, just snap a picture. The vision model extracts amount, vendor, and date, and an LLM categorizes it based on past behavior.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec2',
    confidence: 5,
    maturity: 15,
    nextAction: 'Test Gemini Vision API with 5 sample receipts',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: ['i4', 'i8'],
  },
  {
    id: 'i3',
    title: 'Biometric Sleep Optimizer',
    summary: 'Adjust room temperature and lighting in real-time based on deep sleep cycles.',
    content: 'Using data from wearables (Oura, Apple Watch), this system would talk to smart home devices (Nest, Hue) to optimize the environment for deep sleep. If deep sleep is detected, lower temp by 2 degrees. If REM is detected, start a very slow sunrise simulation.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec3',
    confidence: 8,
    maturity: 60,
    nextAction: 'Check HomeKit API for real-time temp control',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: ['i7', 'i6'],
  },
  {
    id: 'p-motto-1',
    title: 'The Map is Not the Territory',
    summary: 'A reminder that models of reality are not reality itself.',
    content: 'Our mental models, theories, and perceptions are simplifications. Always look for the nuances that the model misses. Useful for avoiding over-confidence in data or rigid thinking.',
    type: 'Principle',
    stage: 'Evergreen',
    sectionId: 'sec1',
    confidence: 10,
    maturity: 100,
    lastReviewed: new Date().toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'p-motto-2',
    title: 'Invert, Always Invert',
    summary: 'To solve a problem, think about how to fail first.',
    content: 'Instead of asking "How can I be successful?", ask "What would guarantee failure?" and then avoid those things. A powerful mental model from Charlie Munger.',
    type: 'Principle',
    stage: 'Evergreen',
    sectionId: 'sec2',
    confidence: 10,
    maturity: 100,
    lastReviewed: new Date().toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i4',
    title: 'Decentralized Subscription Manager',
    summary: 'Track and cancel recurring payments without giving a third-party access to your bank login.',
    content: 'Uses local browser extension to scan for "subscription" keywords in your email and bank statements (locally) and provides a dashboard to manage them. No data ever leaves your machine.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec2',
    confidence: 6,
    maturity: 20,
    nextAction: 'Draft privacy-first architecture diagram',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i5',
    title: 'Voice-to-Code IDE Plugin',
    summary: 'Write complex boilerplate and logic using natural language voice commands.',
    content: 'A VS Code plugin that listens for specific triggers. "Add a React component named UserProfile with tailwind classes for a card layout" would generate the code instantly. Focus on accessibility for developers with RSI.',
    type: 'Concept',
    stage: 'Evergreen',
    sectionId: 'sec1',
    confidence: 9,
    maturity: 85,
    nextAction: 'Refine voice trigger sensitivity',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i6',
    title: 'Smart Garden Irrigation',
    summary: 'Predictive watering based on soil moisture sensors and hyper-local weather forecasts.',
    content: 'Connect ESP32 sensors to a central dashboard. If the forecast says it will rain in 2 hours, skip the morning watering cycle even if soil is dry.',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec4',
    confidence: 7,
    maturity: 50,
    nextAction: 'Order 3 more moisture sensors',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i7',
    title: 'Mindfulness Meditation VR',
    summary: 'Immersive VR environments that react to your heart rate for deeper meditation.',
    content: 'If your heart rate is high, the VR environment is a bit chaotic (windy, dark). As you breathe and heart rate drops, the environment becomes calm, sunny, and serene. Real-time biofeedback loop.',
    type: 'Concept',
    stage: 'Seed',
    sectionId: 'sec3',
    confidence: 4,
    maturity: 10,
    nextAction: 'Research WebXR heart rate integration',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 15).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: [],
  },
  {
    id: 'i8',
    title: 'Personal Carbon Tracker',
    summary: 'Automatically estimate carbon footprint from purchase history.',
    content: 'Integrate with the Expense Categorizer (i2). If you buy gas, calculate CO2. If you buy a flight, calculate CO2. Provide a monthly "Carbon Budget".',
    type: 'Concept',
    stage: 'Sprouting',
    sectionId: 'sec4',
    confidence: 6,
    maturity: 35,
    nextAction: 'Find a reliable CO2 estimation API',
    lastReviewed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    linkedNoteIds: [],
    relatedIdeaIds: ['i2'],
  }
] satisfies Omit<Idea, 'layer'>[];

const hydratedInitialIdeas: Idea[] = initialIdeas.map((idea) => ({ ...idea, layer: 'knowledge' as const }));

const initialProjects: Project[] = [];

const initialFusionItems: FusionItem[] = [];

const capabilitySeededAt = new Date().toISOString();

const initialCapabilityBets: CapabilityBet[] = [
  {
    id: 'cb-learn-chinese',
    title: 'Learn Chinese',
    thesis: 'Chinese may become a high-leverage long-horizon capability if China-linked opportunity, information flow, and network effects keep rising enough to justify serious study.',
    baselineConviction: 58,
    status: 'watching',
    conviction: 58,
    thresholdToCommit: 80,
    salience: 61,
    keywords: ['chinese', 'mandarin', 'china', 'sinophone', 'taobao', 'wechat', 'xiaohongshu', 'douyin'],
    supportingSignalIds: [],
    contradictingSignalIds: [],
    complicatingSignalIds: [],
    lastReviewed: capabilitySeededAt,
    unlockPaths: ['direct market reading', 'relationship access', 'faster supplier and operator research', 'distribution edge into China-linked ecosystems'],
    firstUseCases: ['read primary-source market chatter', 'navigate Chinese products and docs', 'source opportunities earlier'],
    costOfNotKnowing: 'Stay dependent on translations and second-hand interpretation as China-linked opportunity grows.',
    reviewCadence: 'monthly or when new strong signals land',
    strategicNote: 'Do not commit just because it feels intellectually impressive. Commit when repeated signals make it economically or strategically real.',
    createdAt: capabilitySeededAt,
    updatedAt: capabilitySeededAt,
  },
];

const initialSignalEvents: SignalEvent[] = [];

const initialCapabilityTimelineEvents: CapabilityTimelineEvent[] = initialCapabilityBets.map((bet) => ({
  id: `${bet.id}:baseline`,
  capabilityBetId: bet.id,
  createdAt: bet.createdAt,
  reason: 'baseline',
  previousConviction: bet.baselineConviction,
  conviction: bet.conviction,
  delta: 0,
  previousStatus: bet.status,
  status: bet.status,
  salience: bet.salience,
  evidenceIds: [],
  summary: 'Baseline conviction snapshot before evidence starts moving this bet.',
}));

function randomId() {
  return Math.random().toString(36).substring(2, 10);
}

function persistSnapshot(snapshot: AppSnapshot) {
  // Fire and forget; the storage layer reports its result via
  // subscribeSaveResults() so the UI can show a banner if the
  // server save failed.
  void localSnapshotRepository.save(snapshot);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
  return value.toLowerCase();
}

function arraysMatch(a: string[] | undefined, b: string[] | undefined) {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

function trimList(items: string[] | undefined, maxItems = 6) {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).slice(0, maxItems);
}

function inferEvidencePolarity(note: Note): EvidencePolarity {
  if (note.capabilityEvidencePolarity) return note.capabilityEvidencePolarity;

  const explicit = note.signalAssessment?.direction;
  if (explicit === 'Supports') return 'supports';
  if (explicit === 'Weakens') return 'contradicts';
  if (explicit === 'Mixed') return 'complicates';

  const content = normalizeText(note.content);
  if (/(not now|too early|overrated|unlikely|no edge|won't matter|waste)/.test(content)) return 'contradicts';
  if (/(hard|costly|difficult|tradeoff|but|however|unclear)/.test(content)) return 'complicates';
  return 'supports';
}

function buildCapabilitySignalEvents(capabilityBets: CapabilityBet[], notes: Note[]): SignalEvent[] {
  const events: SignalEvent[] = [];

  for (const note of notes) {
    const content = normalizeText(note.content);
    const strength = note.signalAssessment?.strength ?? 5;
    const confidence = note.signalAssessment?.confidence ?? 5;
    const direction = inferEvidencePolarity(note);
    const explicitBetIds = note.capabilityBetIds ?? [];

    const extractionGateActive = (note.extractionReview?.capabilityCandidates.length ?? 0) > 0;

    for (const bet of capabilityBets) {
      if (bet.archivedAt) continue;

      const keywordHits = extractionGateActive
        ? 0
        : bet.keywords.filter((keyword) => content.includes(keyword.toLowerCase())).length;
      const explicitlyLinked = explicitBetIds.includes(bet.id);
      if (!keywordHits && !explicitlyLinked) continue;

      const baseWeight = strength * 1.8 + confidence * 1.6 + keywordHits * 8 + (explicitlyLinked ? 12 : 0);
      const polarityMultiplier = direction === 'contradicts' ? 1.15 : direction === 'complicates' ? 0.85 : 1;
      const weight = clamp(Math.round(baseWeight * polarityMultiplier), 8, 100);

      events.push({
        id: `${bet.id}:${note.id}`,
        noteId: note.id,
        capabilityBetId: bet.id,
        polarity: direction,
        weight,
        summary: (note.capabilityEvidenceSummary || note.content).replace(/\s+/g, ' ').trim().slice(0, 160),
        createdAt: note.createdAt,
      });
    }
  }

  return events;
}

function getCapabilityBetStatus(conviction: number, thresholdToCommit: number): CapabilityBetStatus {
  if (conviction >= thresholdToCommit) return 'committed';
  if (conviction >= 70) return 'preparing';
  if (conviction >= 50) return 'exploring';
  return 'watching';
}

function buildCapabilityTimelineSummary(related: SignalEvent[]) {
  const supporting = related.filter((event) => event.polarity === 'supports');
  const contradicting = related.filter((event) => event.polarity === 'contradicts');
  const complicating = related.filter((event) => event.polarity === 'complicates');
  const latestEvidence = [...related]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 2)
    .map((event) => event.summary)
    .filter(Boolean);

  const counts = `${supporting.length} support, ${contradicting.length} contradict, ${complicating.length} complicate`;
  return latestEvidence.length
    ? `${counts}. Latest evidence: ${latestEvidence.join(' | ')}`
    : `${counts}. No linked evidence yet.`;
}

function buildCapabilityTimelineEvent(params: {
  previousBet: CapabilityBet;
  nextBet: CapabilityBet;
  relatedEvents: SignalEvent[];
  reason: CapabilityTimelineEventReason;
}) {
  const { previousBet, nextBet, relatedEvents, reason } = params;
  return {
    id: `${nextBet.id}:${randomId()}`,
    capabilityBetId: nextBet.id,
    createdAt: new Date().toISOString(),
    reason,
    previousConviction: previousBet.conviction,
    conviction: nextBet.conviction,
    delta: nextBet.conviction - previousBet.conviction,
    previousStatus: previousBet.status,
    status: nextBet.status,
    salience: nextBet.salience,
    evidenceIds: relatedEvents
      .map((event) => event.id)
      .sort(),
    summary: buildCapabilityTimelineSummary(relatedEvents),
  } satisfies CapabilityTimelineEvent;
}

function deriveCapabilityBetFields(
  capabilityBets: CapabilityBet[],
  notes: Note[],
  existingTimelineEvents: CapabilityTimelineEvent[] = [],
  options: {
    recordTimeline?: boolean;
    reason?: CapabilityTimelineEventReason;
  } = {},
) {
  const signalEvents = buildCapabilitySignalEvents(capabilityBets, notes);
  const nextTimelineEvents = [...existingTimelineEvents];

  const nextBets = capabilityBets.map((bet) => {
    if (bet.archivedAt) {
      return {
        ...bet,
        supportingSignalIds: [],
        contradictingSignalIds: [],
        complicatingSignalIds: [],
      };
    }

    const related = signalEvents.filter((event) => event.capabilityBetId === bet.id);
    const supporting = related.filter((event) => event.polarity === 'supports');
    const contradicting = related.filter((event) => event.polarity === 'contradicts');
    const complicating = related.filter((event) => event.polarity === 'complicates');

    const positiveDelta = supporting.reduce((sum, event) => sum + event.weight, 0) * 0.08;
    const negativeDelta = contradicting.reduce((sum, event) => sum + event.weight, 0) * 0.1;
    const complicationDelta = complicating.reduce((sum, event) => sum + event.weight, 0) * 0.04;
    const recurrenceModifier = related.length >= 4 ? 4 : related.length >= 2 ? 2 : 0;
    const baselineConviction = clamp(bet.baselineConviction ?? bet.conviction, 0, 100);
    const conviction = clamp(Math.round(baselineConviction + positiveDelta - negativeDelta - complicationDelta + recurrenceModifier), 0, 100);
    const salience = clamp(Math.round(35 + related.length * 6 + positiveDelta * 0.9 - negativeDelta * 0.7), 0, 100);

    const status = getCapabilityBetStatus(conviction, bet.thresholdToCommit);

    const nextBet = {
      ...bet,
      baselineConviction,
      status,
      conviction,
      salience,
      supportingSignalIds: supporting.map((event) => event.id),
      contradictingSignalIds: contradicting.map((event) => event.id),
      complicatingSignalIds: complicating.map((event) => event.id),
      lastReviewed: related.length ? related.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt : bet.lastReviewed,
      updatedAt: bet.updatedAt || bet.createdAt || new Date().toISOString(),
    };

    if (!nextTimelineEvents.some((event) => event.capabilityBetId === bet.id)) {
      nextTimelineEvents.push({
        id: `${bet.id}:baseline`,
        capabilityBetId: bet.id,
        createdAt: bet.createdAt || new Date().toISOString(),
        reason: 'baseline',
        previousConviction: baselineConviction,
        conviction: baselineConviction,
        delta: 0,
        previousStatus: getCapabilityBetStatus(baselineConviction, bet.thresholdToCommit),
        status: getCapabilityBetStatus(baselineConviction, bet.thresholdToCommit),
        salience: nextBet.salience,
        evidenceIds: [],
        summary: 'Baseline conviction snapshot before evidence starts moving this bet.',
      });
    }

    const changed =
      bet.conviction !== nextBet.conviction ||
      bet.status !== nextBet.status ||
      bet.salience !== nextBet.salience ||
      !arraysMatch(bet.supportingSignalIds, nextBet.supportingSignalIds) ||
      !arraysMatch(bet.contradictingSignalIds, nextBet.contradictingSignalIds) ||
      !arraysMatch(bet.complicatingSignalIds, nextBet.complicatingSignalIds);

    if (options.recordTimeline && changed) {
      const candidateEvent = buildCapabilityTimelineEvent({
        previousBet: { ...bet, baselineConviction },
        nextBet,
        relatedEvents: related,
        reason: options.reason ?? 'signal-change',
      });
      const previousEvent = nextTimelineEvents
        .filter((event) => event.capabilityBetId === bet.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      const isDuplicate =
        previousEvent &&
        previousEvent.conviction === candidateEvent.conviction &&
        previousEvent.status === candidateEvent.status &&
        previousEvent.salience === candidateEvent.salience &&
        arraysMatch(previousEvent.evidenceIds, candidateEvent.evidenceIds);

      if (!isDuplicate) {
        nextTimelineEvents.push(candidateEvent);
      }
    }

    return nextBet;
  });

  return { capabilityBets: nextBets, signalEvents, capabilityTimelineEvents: nextTimelineEvents };
}

function normalizeOptionalText(value: string | undefined, fallback?: string) {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeCapabilityBet(input: {
  title: string;
  thesis: string;
  baselineConviction?: number;
  thresholdToCommit?: number;
  keywords?: string[];
  unlockPaths?: string[];
  firstUseCases?: string[];
  costOfNotKnowing?: string;
  reviewCadence?: string;
  strategicNote?: string;
  archivedAt?: string;
}, existing?: CapabilityBet): CapabilityBet {
  const now = new Date().toISOString();
  const thresholdToCommit = clamp(Math.round(Number(input.thresholdToCommit ?? existing?.thresholdToCommit ?? 80)), 0, 100);
  const baselineConviction = clamp(
    Math.round(Number(input.baselineConviction ?? existing?.baselineConviction ?? existing?.conviction ?? 50)),
    0,
    100,
  );
  const status = getCapabilityBetStatus(existing?.conviction ?? baselineConviction, thresholdToCommit);

  return {
    id: existing?.id ?? randomId(),
    title: input.title.trim() || existing?.title || 'Untitled capability bet',
    thesis: input.thesis.trim() || existing?.thesis || 'Write the thesis that makes this capability worth watching.',
    baselineConviction,
    status,
    conviction: existing?.conviction ?? baselineConviction,
    thresholdToCommit,
    salience: existing?.salience ?? 35,
    keywords: trimList(input.keywords ?? existing?.keywords, 12),
    supportingSignalIds: existing?.supportingSignalIds ?? [],
    contradictingSignalIds: existing?.contradictingSignalIds ?? [],
    complicatingSignalIds: existing?.complicatingSignalIds ?? [],
    lastReviewed: existing?.lastReviewed ?? now,
    unlockPaths: trimList(input.unlockPaths ?? existing?.unlockPaths, 8),
    firstUseCases: trimList(input.firstUseCases ?? existing?.firstUseCases, 8),
    costOfNotKnowing: normalizeOptionalText(input.costOfNotKnowing, existing?.costOfNotKnowing),
    reviewCadence: normalizeOptionalText(input.reviewCadence, existing?.reviewCadence),
    strategicNote: normalizeOptionalText(input.strategicNote, existing?.strategicNote),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: input.archivedAt ?? existing?.archivedAt,
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  notes: initialNotes,
  ideas: hydratedInitialIdeas,
  projects: initialProjects,
  fusionItems: initialFusionItems,
  sections: initialSections,
  goals: [],
  reflections: [],
  capabilityBets: initialCapabilityBets,
  signalEvents: initialSignalEvents,
  capabilityTimelineEvents: initialCapabilityTimelineEvents,
  isDarkMode: false,
  chatMessages: [],
  chatThreads: [],
  activeThreadId: '',
  fusionSuggestions: [],
  lastDailyFusionScan: '',
  lastPersistError: null,
  lastPersistAt: null,
  setChatMessages: (messages) => set((state) => {
    let activeId = state.activeThreadId;
    let chatThreads = [...state.chatThreads];
    
    // Auto-rename title if it's the default name and it's the user's first prompt
    const userPrompt = messages.find(m => m.role === 'user')?.content || '';
    const cleanPrompt = userPrompt.slice(0, 32).trim();
    
    if (!activeId) {
      activeId = randomId();
      chatThreads = [{
        id: activeId,
        title: cleanPrompt || 'New Conversation',
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, ...chatThreads];
    } else {
      chatThreads = chatThreads.map(t => t.id === activeId ? {
        ...t,
        messages,
        updatedAt: new Date().toISOString(),
        title: (t.title === 'New Conversation' || t.title === 'Legacy Chat') && cleanPrompt
          ? cleanPrompt
          : t.title
      } : t);
    }
    
    const next = {
      ...state,
      chatThreads,
      activeThreadId: activeId,
      chatMessages: messages,
    };
    persistSnapshot(next);
    return { chatThreads, activeThreadId: activeId, chatMessages: messages };
  }),
  setChatThreads: (threads) => set((state) => {
    const activeThread = threads.find(t => t.id === state.activeThreadId) || threads[0];
    const activeThreadId = activeThread ? activeThread.id : '';
    const chatMessages = activeThread ? activeThread.messages : [];
    const next = {
      ...state,
      chatThreads: threads,
      activeThreadId,
      chatMessages,
    };
    persistSnapshot(next);
    return { chatThreads: threads, activeThreadId, chatMessages };
  }),
  setActiveThreadId: (id) => set((state) => {
    const activeThread = state.chatThreads.find(t => t.id === id);
    const chatMessages = activeThread ? activeThread.messages : [];
    const next = {
      ...state,
      activeThreadId: id,
      chatMessages,
    };
    persistSnapshot(next);
    return { activeThreadId: id, chatMessages };
  }),
  createChatThread: (title) => {
    const id = randomId();
    const newThread: ChatThread = {
      id,
      title: title || 'New Conversation',
      messages: [
        {
          id: 'greeting-' + id,
          role: 'model',
          content: "Hi. I'm your HumanBoard assistant. I can help refine ideas, suggest experiments, summarize notes, and connect thoughts across the app. What are we working on?",
          createdAt: new Date().toISOString(),
        }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    set((state) => {
      const chatThreads = [newThread, ...state.chatThreads];
      const next = {
        ...state,
        chatThreads,
        activeThreadId: id,
        chatMessages: newThread.messages,
      };
      persistSnapshot(next);
      return { chatThreads, activeThreadId: id, chatMessages: newThread.messages };
    });
    return id;
  },
  deleteChatThread: (id) => set((state) => {
    const chatThreads = state.chatThreads.filter(t => t.id !== id);
    let activeThreadId = state.activeThreadId;
    if (activeThreadId === id) {
      activeThreadId = chatThreads[0] ? chatThreads[0].id : '';
    }
    const activeThread = chatThreads.find(t => t.id === activeThreadId);
    const chatMessages = activeThread ? activeThread.messages : [];
    const next = {
      ...state,
      chatThreads,
      activeThreadId,
      chatMessages,
    };
    persistSnapshot(next);
    return { chatThreads, activeThreadId, chatMessages };
  }),
  renameChatThread: (id, title) => set((state) => {
    const chatThreads = state.chatThreads.map(t => t.id === id ? { ...t, title: title.trim() || 'Untitled', updatedAt: new Date().toISOString() } : t);
    const next = {
      ...state,
      chatThreads,
    };
    persistSnapshot(next);
    return { chatThreads };
  }),
  addNote: (content) => set((state) => {
    const nextNotes = [{ id: randomId(), content, createdAt: new Date().toISOString(), layer: 'raw' as const }, ...state.notes];
    const derived = deriveCapabilityBetFields(state.capabilityBets, nextNotes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'signal-change',
    });
    const nextIdeas = deriveStrategicIdeaFields(state.ideas, nextNotes);
    const next = {
      ...state,
      notes: nextNotes,
      ideas: nextIdeas,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      notes: next.notes,
      ideas: next.ideas,
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  updateNote: (id, updates) => set((state) => {
    const nextNotes = state.notes.map((note) => note.id === id ? { ...note, ...updates } : note);
    const derived = deriveCapabilityBetFields(state.capabilityBets, nextNotes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'signal-change',
    });
    const nextIdeas = deriveStrategicIdeaFields(state.ideas, nextNotes);
    const next = {
      ...state,
      notes: nextNotes,
      ideas: nextIdeas,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      notes: next.notes,
      ideas: next.ideas,
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  deleteNote: (id) => set((state) => {
    const nextNotes = state.notes.filter(n => n.id !== id);
    const derived = deriveCapabilityBetFields(state.capabilityBets, nextNotes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'signal-change',
    });
    const nextIdeas = deriveStrategicIdeaFields(state.ideas, nextNotes);
    const next = {
      ...state,
      notes: nextNotes,
      ideas: nextIdeas,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      notes: next.notes,
      ideas: next.ideas,
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  addIdea: (idea) => set((state) => {
    const sectionIds = idea.sectionIds ?? (idea.sectionId ? [idea.sectionId] : []);
    const sectionId = idea.sectionId ?? (sectionIds[0] || undefined);
    const newIdeas = [{
      ...idea,
      id: randomId(),
      layer: 'knowledge' as const,
      lastReviewed: new Date().toISOString(),
      sectionId,
      sectionIds,
    }, ...state.ideas];
    const derivedIdeas = deriveStrategicIdeaFields(newIdeas, state.notes);
    const next = {
      ...state,
      ideas: derivedIdeas,
    };
    persistSnapshot(next);
    return { ideas: next.ideas };
  }),
  updateIdea: (id, updates) => set((state) => {
    let mergedUpdates = { ...updates };
    if (updates.sectionIds !== undefined) {
      mergedUpdates.sectionId = updates.sectionIds.length > 0 ? updates.sectionIds[0] : undefined;
    } else if (updates.sectionId !== undefined) {
      mergedUpdates.sectionIds = updates.sectionId ? [updates.sectionId] : [];
    }

    const updatedIdeas = state.ideas.map(i => i.id === id ? { ...i, ...mergedUpdates } : i);
    const derivedIdeas = deriveStrategicIdeaFields(updatedIdeas, state.notes);
    const next = {
      ...state,
      ideas: derivedIdeas,
    };
    persistSnapshot(next);
    return { ideas: next.ideas };
  }),
  deleteIdea: (id) => set((state) => {
    const nextIdeas = state.ideas.filter(i => i.id !== id);
    const derivedIdeas = deriveStrategicIdeaFields(nextIdeas, state.notes);
    const next = {
      ...state,
      ideas: derivedIdeas,
    };
    persistSnapshot(next);
    return { ideas: next.ideas };
  }),
  addProject: (project) => set((state) => {
    const now = new Date().toISOString();
    const next = {
      ...state,
      projects: [{
        ...project,
        id: randomId(),
        goalId: project.goalId ?? '',
        nextAction: project.nextAction ?? '',
        definitionOfDone: project.definitionOfDone ?? '',
        dueDate: project.dueDate ?? '',
        createdAt: project.createdAt ?? now,
        lastUpdatedAt: project.lastUpdatedAt ?? now,
        linkedNoteIds: project.linkedNoteIds ?? [],
        linkedIdeaIds: project.linkedIdeaIds ?? [],
        linkedGoalIds: project.linkedGoalIds ?? [],
        tasks: project.tasks ?? [],
        updates: project.updates ?? [],
        experiments: project.experiments ?? [],
      }, ...state.projects],
    };
    persistSnapshot(next);
    return { projects: next.projects };
  }),
  updateProject: (id, updates) => set((state) => {
    const next = {
      ...state,
      projects: state.projects.map((project) => project.id === id ? { ...project, ...updates, lastUpdatedAt: new Date().toISOString() } : project),
    };
    persistSnapshot(next);
    return { projects: next.projects };
  }),
  deleteProject: (id) => set((state) => {
    const next = {
      ...state,
      projects: state.projects.filter((project) => project.id !== id),
    };
    persistSnapshot(next);
    return { projects: next.projects };
  }),
  addFusionItem: (item) => {
    const now = new Date().toISOString();
    const newId = randomId();
    set((state) => {
      const tempItem = {
        ...item,
        linkedNoteIds: item.linkedNoteIds ?? [],
        linkedIdeaIds: item.linkedIdeaIds ?? [],
        linkedGoalIds: item.linkedGoalIds ?? [],
        linkedProjectIds: item.linkedProjectIds ?? [],
      };
      const checklist = computeFusionChecklist(tempItem);
      const shareReadiness = computeFusionReadiness(checklist);
      const nextItem: FusionItem = {
        ...item,
        id: newId,
        createdAt: now,
        updatedAt: now,
        completedAt: item.status === 'Completed' ? now : undefined,
        linkedNoteIds: item.linkedNoteIds ?? [],
        linkedIdeaIds: item.linkedIdeaIds ?? [],
        linkedGoalIds: item.linkedGoalIds ?? [],
        linkedProjectIds: item.linkedProjectIds ?? [],
        summary: item.summary ?? '',
        centralConclusion: item.centralConclusion ?? '',
        body: item.body ?? '',
        checklist,
        shareReadiness,
      };
      const next = {
        ...state,
        fusionItems: [nextItem, ...state.fusionItems],
      };
      persistSnapshot(next);
      return { fusionItems: next.fusionItems };
    });
    return newId;
  },
  updateFusionItem: (id, updates) => set((state) => {
    const next = {
      ...state,
      fusionItems: state.fusionItems.map((item) => {
        if (item.id !== id) return item;
        const merged = {
          ...item,
          ...updates,
          updatedAt: new Date().toISOString(),
          completedAt: (updates.status ?? item.status) === 'Completed' ? (item.completedAt ?? new Date().toISOString()) : item.completedAt,
        };
        const checklist = computeFusionChecklist(merged);
        return { ...merged, checklist, shareReadiness: computeFusionReadiness(checklist) };
      }),
    };
    persistSnapshot(next);
    return { fusionItems: next.fusionItems };
  }),
  deleteFusionItem: (id) => set((state) => {
    const next = {
      ...state,
      fusionItems: state.fusionItems.filter((item) => item.id !== id),
    };
    persistSnapshot(next);
    return { fusionItems: next.fusionItems };
  }),
  addSection: (section) => {
    const id = randomId();
    set((state) => {
      const next = {
        ...state,
        sections: [...state.sections, { ...section, id }],
      };
      persistSnapshot(next);
      return { sections: next.sections };
    });
    return id;
  },
  addGoal: (goal) => set((state) => {
    const next = {
      ...state,
      goals: [{ ...goal, id: randomId(), createdAt: new Date().toISOString() }, ...state.goals],
    };
    persistSnapshot(next);
    return { goals: next.goals };
  }),
  updateGoal: (id, updates) => set((state) => {
    const next = {
      ...state,
      goals: state.goals.map(g => g.id === id ? { ...g, ...updates } : g),
    };
    persistSnapshot(next);
    return { goals: next.goals };
  }),
  deleteGoal: (id) => set((state) => {
    const next = {
      ...state,
      goals: state.goals.filter(g => g.id !== id),
    };
    persistSnapshot(next);
    return { goals: next.goals };
  }),
  addReflection: (reflection) => {
    const createdReflection: Reflection = {
      ...reflection,
      id: randomId(),
      createdAt: new Date().toISOString(),
    };

    set((state) => {
      const next = {
        ...state,
        reflections: [createdReflection, ...state.reflections],
      };
      persistSnapshot(next);
      return { reflections: next.reflections };
    });

    return createdReflection;
  },
  updateReflection: (id, updates) => set((state) => {
    const next = {
      ...state,
      reflections: state.reflections.map((reflection) => reflection.id === id ? { ...reflection, ...updates } : reflection),
    };
    persistSnapshot(next);
    return { reflections: next.reflections };
  }),
  dismissReflection: (id) => set((state) => {
    const next = {
      ...state,
      reflections: state.reflections.map((reflection) => reflection.id === id ? { ...reflection, dismissedAt: new Date().toISOString() } : reflection),
    };
    persistSnapshot(next);
    return { reflections: next.reflections };
  }),
  setReflectionFeedback: (id, feedback) => set((state) => {
    const next = {
      ...state,
      reflections: state.reflections.map((reflection) => reflection.id === id ? { ...reflection, feedback } : reflection),
    };
    persistSnapshot(next);
    return { reflections: next.reflections };
  }),
  setIdeas: (ideas) => set((state) => {
    const next = {
      ...state,
      ideas,
    };
    persistSnapshot(next);
    return { ideas: next.ideas };
  }),
  addCapabilityBet: (bet) => set((state) => {
    const nextCapabilityBets = [normalizeCapabilityBet({
      title: bet.title,
      thesis: bet.thesis,
      baselineConviction: bet.baselineConviction,
      thresholdToCommit: bet.thresholdToCommit,
      keywords: bet.keywords,
      unlockPaths: bet.unlockPaths,
      firstUseCases: bet.firstUseCases,
      costOfNotKnowing: bet.costOfNotKnowing,
      reviewCadence: bet.reviewCadence,
      strategicNote: bet.strategicNote,
    }), ...state.capabilityBets];
    const derived = deriveCapabilityBetFields(nextCapabilityBets, state.notes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'manual-edit',
    });
    const next = {
      ...state,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  updateCapabilityBet: (id, updates) => set((state) => {
    const nextCapabilityBets = state.capabilityBets.map((bet) => {
      if (bet.id !== id) return bet;
      return normalizeCapabilityBet({
        title: updates.title ?? bet.title,
        thesis: updates.thesis ?? bet.thesis,
        baselineConviction: updates.baselineConviction,
        thresholdToCommit: updates.thresholdToCommit,
        keywords: updates.keywords,
        unlockPaths: updates.unlockPaths,
        firstUseCases: updates.firstUseCases,
        costOfNotKnowing: updates.costOfNotKnowing,
        reviewCadence: updates.reviewCadence,
        strategicNote: updates.strategicNote,
        archivedAt: updates.archivedAt,
      }, bet);
    });
    const derived = deriveCapabilityBetFields(nextCapabilityBets, state.notes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'manual-edit',
    });
    const next = {
      ...state,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  archiveCapabilityBet: (id) => set((state) => {
    const nextCapabilityBets = state.capabilityBets.map((bet) => (
      bet.id === id ? normalizeCapabilityBet({
        title: bet.title,
        thesis: bet.thesis,
        baselineConviction: bet.baselineConviction,
        thresholdToCommit: bet.thresholdToCommit,
        keywords: bet.keywords,
        unlockPaths: bet.unlockPaths,
        firstUseCases: bet.firstUseCases,
        costOfNotKnowing: bet.costOfNotKnowing,
        reviewCadence: bet.reviewCadence,
        strategicNote: bet.strategicNote,
        archivedAt: new Date().toISOString(),
      }, bet) : bet
    ));
    const derived = deriveCapabilityBetFields(nextCapabilityBets, state.notes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'manual-edit',
    });
    const next = {
      ...state,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  recomputeStrategicAlignment: () => set((state) => {
    const ideas = deriveStrategicIdeaFields(state.ideas, state.notes);
    const unchanged = JSON.stringify(ideas) === JSON.stringify(state.ideas);
    if (unchanged) return {};

    const next = {
      ...state,
      ideas,
    };
    persistSnapshot(next);
    return { ideas: next.ideas };
  }),
  recomputeCapabilityBetSignals: () => set((state) => {
    const derived = deriveCapabilityBetFields(state.capabilityBets, state.notes, state.capabilityTimelineEvents, {
      recordTimeline: true,
      reason: 'signal-change',
    });
    const next = {
      ...state,
      capabilityBets: derived.capabilityBets,
      signalEvents: derived.signalEvents,
      capabilityTimelineEvents: derived.capabilityTimelineEvents,
    };
    persistSnapshot(next);
    return {
      capabilityBets: next.capabilityBets,
      signalEvents: next.signalEvents,
      capabilityTimelineEvents: next.capabilityTimelineEvents,
    };
  }),
  toggleDarkMode: () => set((state) => {
    const next = { ...state, isDarkMode: !state.isDarkMode };
    persistSnapshot(next);
    return { isDarkMode: next.isDarkMode };
  }),
  clearPersistError: () => set(() => ({ lastPersistError: null })),
  persistRetry: async () => {
    // Force a re-save of the current snapshot. The storage layer reports
    // success/failure via subscribeSaveResults(); we mirror that into the
    // store so the UI can show a banner with the outcome.
    const state = useAppStore.getState();
    const snapshot: AppSnapshot = {
      notes: state.notes,
      ideas: state.ideas,
      projects: state.projects,
      sections: state.sections,
      goals: state.goals,
      reflections: state.reflections,
      capabilityBets: state.capabilityBets,
      signalEvents: state.signalEvents,
      capabilityTimelineEvents: state.capabilityTimelineEvents,
      isDarkMode: state.isDarkMode,
      fusionItems: state.fusionItems,
      fusionSuggestions: state.fusionSuggestions,
      lastDailyFusionScan: state.lastDailyFusionScan,
      chatThreads: state.chatThreads,
      activeThreadId: state.activeThreadId,
      chatMessages: state.chatMessages,
    };
    const result = (await localSnapshotRepository.save(snapshot)) as SaveResult;
    useAppStore.setState({
      lastPersistAt: new Date().toISOString(),
      lastPersistError: result.ok
        ? null
        : (result.error ?? (result.serverSkipped
            ? 'Server save skipped (no auth?). Local-only persistence is in effect.'
            : 'unknown error')),
    });
  },
  setFusionSuggestions: (suggestions) => set((state) => {
    const next = { ...state, fusionSuggestions: suggestions };
    persistSnapshot(next);
    return { fusionSuggestions: next.fusionSuggestions };
  }),
  setLastDailyFusionScan: (timestamp) => set((state) => {
    const next = { ...state, lastDailyFusionScan: timestamp };
    persistSnapshot(next);
    return { lastDailyFusionScan: next.lastDailyFusionScan };
  }),
  dismissFusionSuggestion: (id) => set((state) => {
    const next = { ...state, fusionSuggestions: state.fusionSuggestions.filter((s) => s.id !== id) };
    persistSnapshot(next);
    return { fusionSuggestions: next.fusionSuggestions };
  }),
}));

export async function hydrateAppStoreFromRepository() {
  const snapshot = await localSnapshotRepository.load();
  const chatCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const hydratedSnapshot: AppSnapshot = {
    ...snapshot,
    notes: snapshot.notes.map((note) => ({ ...note, layer: 'raw' as const })),
    ideas: deriveStrategicIdeaFields(
      snapshot.ideas
        .map((idea) => ({ ...idea, layer: 'knowledge' as const })),
      snapshot.notes.map((note) => ({ ...note, layer: 'raw' as const })),
    ),
    sections: snapshot.sections.length ? snapshot.sections : defaultSections,
    capabilityBets: Array.isArray(snapshot.capabilityBets)
      ? snapshot.capabilityBets.map((bet) => normalizeCapabilityBet({
        title: bet.title,
        thesis: bet.thesis,
        baselineConviction: bet.baselineConviction,
        thresholdToCommit: bet.thresholdToCommit,
        keywords: bet.keywords,
        unlockPaths: bet.unlockPaths,
        firstUseCases: bet.firstUseCases,
        costOfNotKnowing: bet.costOfNotKnowing,
        reviewCadence: bet.reviewCadence,
        strategicNote: bet.strategicNote,
        archivedAt: bet.archivedAt,
      }, bet))
      : initialCapabilityBets,
    signalEvents: Array.isArray(snapshot.signalEvents) ? snapshot.signalEvents : [],
    capabilityTimelineEvents: Array.isArray(snapshot.capabilityTimelineEvents)
      ? snapshot.capabilityTimelineEvents
      : initialCapabilityTimelineEvents,
  };

  const derived = deriveCapabilityBetFields(
    hydratedSnapshot.capabilityBets,
    hydratedSnapshot.notes,
    hydratedSnapshot.capabilityTimelineEvents,
  );

  const finalSnapshot = {
    ...hydratedSnapshot,
    capabilityBets: derived.capabilityBets,
    signalEvents: derived.signalEvents,
    capabilityTimelineEvents: derived.capabilityTimelineEvents,
  };

  useAppStore.setState({
    notes: finalSnapshot.notes,
    ideas: finalSnapshot.ideas,
    projects: finalSnapshot.projects,
    sections: finalSnapshot.sections,
    goals: finalSnapshot.goals,
    reflections: finalSnapshot.reflections ?? [],
    capabilityBets: finalSnapshot.capabilityBets,
    signalEvents: finalSnapshot.signalEvents,
    capabilityTimelineEvents: finalSnapshot.capabilityTimelineEvents,
    isDarkMode: finalSnapshot.isDarkMode,
    chatThreads: finalSnapshot.chatThreads ?? [],
    activeThreadId: finalSnapshot.activeThreadId ?? '',
    chatMessages: (() => {
      const threads = finalSnapshot.chatThreads ?? [];
      const activeId = finalSnapshot.activeThreadId ?? '';
      const activeThread = threads.find(t => t.id === activeId) || threads[0];
      if (activeThread) return activeThread.messages;
      return (Array.isArray(finalSnapshot.chatMessages) ? finalSnapshot.chatMessages : [])
        .filter((m) => m && m.createdAt && m.createdAt >= chatCutoff);
    })(),
    fusionItems: finalSnapshot.fusionItems ?? [],
    fusionSuggestions: finalSnapshot.fusionSuggestions ?? [],
    lastDailyFusionScan: finalSnapshot.lastDailyFusionScan ?? '',
  });
}
