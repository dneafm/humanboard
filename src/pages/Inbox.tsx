import { useEffect, useMemo, useState } from 'react';
import { useAppStore, type CapabilityBet, type EvidencePolarity, type IdeaType, type Note, type SignalAssessment } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Archive, Lightbulb, Scale, Sparkles, Check, X, ImagePlus, Loader2, Brain, HelpCircle, Dices, ArrowRight, Target, FileText, Upload, GitMerge, Replace, Trash2 } from 'lucide-react';
import { compileRawNoteToKnowledge, extractCapabilityEvidenceReview } from '../lib/ai';
import { Link, useSearchParams } from 'react-router-dom';
import { shouldTreatAsMeaningfulNote } from '../lib/noteQuality';
import ExtractionReviewPanel from '../components/capability/ExtractionReviewPanel';
import { createNoteFromImage, getClipboardImage } from '../lib/imageNote';
import AdaptiveDashboard from '../components/AdaptiveDashboard';
import DailySynthesisCard from '../components/DailySynthesisCard';
import { colorForNewSection } from '../lib/sections';
import { apiFetch } from '../lib/apiClient';
import { hydrateAppStoreFromRepository } from '../store';
import { buildImportedSnapshot, parseSnapshotImport, snapshotImportCounts, type SnapshotImportMode } from '../lib/snapshotImport';
import type { AppSnapshot } from '../lib/storage/types';

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

type SnapshotImportPreview = {
  fileName: string;
  snapshot: AppSnapshot;
};

const COMPILE_TYPE_LABELS: IdeaType[] = ['Concept', 'Principle', 'Reference', 'Project', 'Question', 'Action', 'Base Skill', 'Umbrella Goal'];

type TensionMode = {
  id: string;
  label: string;
  icon: string;
  colorName: string;
  activeClass: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
  ringClass: string;
  focusBorderClass: string;
  payoffTitle: string;
  payoffDesc: string;
  prefill: string;
  prompts: string[];
};

const TENSION_MODES: TensionMode[] = [
  {
    id: 'contradiction',
    label: 'Contradiction',
    icon: '☯️',
    colorName: 'violet',
    activeClass: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 shadow-[0_0_12px_-3px_rgba(139,92,246,0.15)]',
    borderClass: 'border-violet-200 dark:border-violet-800/60',
    bgClass: 'bg-violet-50/70 dark:bg-violet-950/25',
    textClass: 'text-violet-700 dark:text-violet-300',
    ringClass: 'focus:ring-violet-500/20 dark:focus:ring-violet-500/10',
    focusBorderClass: 'focus:border-violet-400 dark:focus:border-violet-700',
    payoffTitle: 'Contradiction Spotting',
    payoffDesc: 'Identifies discrepancies in your logic, values, or actions (e.g. saying you want X but repeatedly choosing Y).',
    prefill: '☯️ Contradiction: I want to [desire] but I keep [behavior] because: ',
    prompts: [
      'I claim to value freedom/health, but I keep choosing safety/junk food.',
      'I want to spend time on creative projects, but I actually spend my free hours scrolling.',
      'I know I should address a certain problem, but I actively avoid it and pretend it is fine.'
    ]
  },
  {
    id: 'avoidance',
    label: 'Avoidance',
    icon: '🚧',
    colorName: 'rose',
    activeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 shadow-[0_0_12px_-3px_rgba(244,63,94,0.15)]',
    borderClass: 'border-rose-200 dark:border-rose-800/60',
    bgClass: 'bg-rose-50/70 dark:bg-rose-950/25',
    textClass: 'text-rose-700 dark:text-rose-300',
    ringClass: 'focus:ring-rose-500/20 dark:focus:ring-rose-500/10',
    focusBorderClass: 'focus:border-rose-400 dark:focus:border-rose-700',
    payoffTitle: 'Pattern Detection',
    payoffDesc: 'Tracks recurring cognitive loops and items you keep avoiding, warning you when you circle them repeatedly.',
    prefill: '🚧 Avoidance: I have been actively avoiding thinking about or deciding on: ',
    prompts: [
      'What task, conversation, or decision have you kept in the margins today?',
      'What is the biggest elephant in the room of your current week?',
      'Write down the one thing you really do not want to put in this inbox.'
    ]
  },
  {
    id: 'obsession',
    label: 'Obsession',
    icon: '⚡',
    colorName: 'amber',
    activeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 shadow-[0_0_12px_-3px_rgba(245,158,11,0.15)]',
    borderClass: 'border-amber-200 dark:border-amber-800/60',
    bgClass: 'bg-amber-50/70 dark:bg-amber-950/25',
    textClass: 'text-amber-700 dark:text-amber-300',
    ringClass: 'focus:ring-amber-500/20 dark:focus:ring-amber-500/10',
    focusBorderClass: 'focus:border-amber-400 dark:focus:border-amber-700',
    payoffTitle: 'Unexpected Pairing',
    payoffDesc: 'Finds surprising, non-obvious connections between your background obsessions and other active projects or goals.',
    prefill: '⚡ Obsession: I am secretly drawn to or obsessed with: ',
    prompts: [
      'What is currently drawing your attention or curiosity, even if you cannot justify it?',
      'What rabbit hole did you lose yourself in today?',
      'What weird idea or hobby keeps calling to you in the background?'
    ]
  },
  {
    id: 'emotion',
    label: 'Emotion',
    icon: '💔',
    colorName: 'pink',
    activeClass: 'border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300 shadow-[0_0_12px_-3px_rgba(236,72,153,0.15)]',
    borderClass: 'border-pink-200 dark:border-pink-800/60',
    bgClass: 'bg-pink-50/70 dark:bg-pink-950/25',
    textClass: 'text-pink-700 dark:text-pink-300',
    ringClass: 'focus:ring-pink-500/20 dark:focus:ring-pink-500/10',
    focusBorderClass: 'focus:border-pink-400 dark:focus:border-pink-700',
    payoffTitle: 'Identity Mirror',
    payoffDesc: 'Distills the topics and emotional centers that your mind is orbiting most over the course of the week.',
    prefill: '💔 Emotion: I feel a strong sense of [anxiety/excitement/frustration/dread] about: ',
    prompts: [
      'What is charging you emotionally right now (fear, excitement, dread, impatience)?',
      'What interaction or event today left a lingering emotional residue?',
      'What feels highly charged in your environment today?'
    ]
  },
  {
    id: 'fog',
    label: 'Fog',
    icon: '☁️',
    colorName: 'sky',
    activeClass: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 shadow-[0_0_12px_-3px_rgba(14,165,233,0.15)]',
    borderClass: 'border-sky-200 dark:border-sky-800/60',
    bgClass: 'bg-sky-50/70 dark:bg-sky-950/25',
    textClass: 'text-sky-700 dark:text-sky-300',
    ringClass: 'focus:ring-sky-500/20 dark:focus:ring-sky-500/10',
    focusBorderClass: 'focus:border-sky-400 dark:focus:border-sky-700',
    payoffTitle: 'Memory Return',
    payoffDesc: 'Resurfaces these vague feelings contextually when you capture future signals that might clarify them.',
    prefill: '☁️ Fog: What feels foggy, uncertain, or ambiguous in my plans right now is: ',
    prompts: [
      'What is currently unclear or feels like a blind spot in your projects?',
      'What is a question you have that you cannot find the answer to yet?',
      'Where do you feel like you are guessing or operating in the dark?'
    ]
  },
  {
    id: 'halfbaked',
    label: 'Half-Baked',
    icon: '🧩',
    colorName: 'emerald',
    activeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-[0_0_12px_-3px_rgba(16,185,129,0.15)]',
    borderClass: 'border-emerald-200 dark:border-emerald-800/60',
    bgClass: 'bg-emerald-50/70 dark:bg-emerald-950/25',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    ringClass: 'focus:ring-emerald-500/20 dark:focus:ring-emerald-500/10',
    focusBorderClass: 'focus:border-emerald-400 dark:focus:border-emerald-700',
    payoffTitle: 'Instant Compression',
    payoffDesc: 'Converts messy streams of consciousness into a 1-line summary, detected theme, and likely next step.',
    prefill: '🧩 Half-Baked: A raw, unedited thought in my head is: ',
    prompts: [
      'Dump your raw, unedited thoughts. Avoid formatting or polishing them.',
      'What is a hunch you have that you do not have evidence for yet?',
      'What is a half-baked theory you are embarrassed to share with anyone?'
    ]
  }
];

function toggleId(list: string[] | undefined, id: string): string[] {
  const current = list ?? [];
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

function CapabilityEvidenceEditor({ note, capabilityBets, onToggleCapabilityBet, onChangePolarity, onChangeSummary }: {
  note: Note;
  capabilityBets: CapabilityBet[];
  onToggleCapabilityBet: (betId: string) => void;
  onChangePolarity: (polarity: EvidencePolarity) => void;
  onChangeSummary: (summary: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-sky-200/80 bg-sky-50/70 px-4 py-4 dark:border-sky-900/40 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700 dark:text-sky-300">Capability evidence</div>
        {(['supports', 'contradicts', 'complicates'] as EvidencePolarity[]).map((polarity) => {
          const selected = (note.capabilityEvidencePolarity ?? 'supports') === polarity;
          return (
            <button
              key={polarity}
              type="button"
              onClick={() => onChangePolarity(polarity)}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors ${selected ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500' : 'border-sky-200 bg-white text-sky-700 hover:border-sky-300 dark:border-sky-900/50 dark:bg-stone-900 dark:text-sky-300 dark:hover:border-sky-700'}`}
            >
              {polarity}
            </button>
          );
        })}
      </div>

      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Linked capability bets</div>
        <div className="flex flex-wrap gap-2">
          {capabilityBets.map((bet) => {
            const selected = note.capabilityBetIds?.includes(bet.id);
            return (
              <button
                key={bet.id}
                type="button"
                onClick={() => onToggleCapabilityBet(bet.id)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${selected ? 'border-sky-600 bg-sky-600 text-white dark:border-sky-500 dark:bg-sky-500' : 'border-stone-200 bg-white text-stone-600 hover:border-sky-300 hover:text-sky-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-sky-700 dark:hover:text-sky-300'}`}
              >
                {bet.title}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block">
        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Evidence summary for Incubation</span>
        <textarea
          value={note.capabilityEvidenceSummary ?? ''}
          onChange={(e) => onChangeSummary(e.target.value)}
          placeholder="Optional: tighten what this note is actually saying as evidence"
          className="w-full min-h-[84px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-sky-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        />
      </label>
    </div>
  );
}

function SignalLinkEditor({ note, onToggleBaseSkill, onToggleUmbrellaGoal, onToggleIdea }: {
  note: Note;
  onToggleBaseSkill: (ideaId: string) => void;
  onToggleUmbrellaGoal: (ideaId: string) => void;
  onToggleIdea: (ideaId: string) => void;
}) {
  const { ideas } = useAppStore();
  const baseSkills = useMemo(() => ideas.filter((idea) => idea.type === 'Base Skill' || idea.strategicRole === 'Base'), [ideas]);
  const umbrellaGoals = useMemo(() => ideas.filter((idea) => idea.type === 'Umbrella Goal'), [ideas]);
  const vehicleIdeas = useMemo(() => ideas.filter((idea) => idea.type === 'Project' || idea.strategicRole === 'Vehicle' || (idea.type !== 'Base Skill' && idea.type !== 'Umbrella Goal')), [ideas]);
  const assessment = note.signalAssessment;

  if (!assessment) return null;

  const linkedIds = Array.from(new Set([
    ...(assessment.relatedBaseSkillIds ?? []),
    ...(assessment.relatedUmbrellaGoalIds ?? []),
    ...(assessment.relatedIdeaIds ?? []),
  ]));
  const linkedIdeas = ideas.filter((idea) => linkedIds.includes(idea.id));

  const renderChips = (items: typeof ideas, selectedIds: string[] | undefined, onToggle: (ideaId: string) => void, emptyLabel: string) => {
    if (!items.length) {
      return <div className="text-xs text-stone-500 dark:text-stone-400">{emptyLabel}</div>;
    }

    return (
      <div className="flex flex-wrap gap-2">
        {items.map((idea) => {
          const selected = selectedIds?.includes(idea.id);
          return (
            <button
              key={idea.id}
              type="button"
              onClick={() => onToggle(idea.id)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${selected ? 'border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500' : 'border-stone-200 bg-white text-stone-600 hover:border-violet-300 hover:text-violet-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-violet-700 dark:hover:text-violet-300'}`}
            >
              {idea.title}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-violet-200/80 bg-white/80 px-4 py-4 dark:border-violet-900/40 dark:bg-stone-900/40">
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Linked base skills</div>
        {renderChips(baseSkills, assessment.relatedBaseSkillIds, onToggleBaseSkill, 'No base skills yet. Compile or create one first.')}
      </div>
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Linked umbrella goals</div>
        {renderChips(umbrellaGoals, assessment.relatedUmbrellaGoalIds, onToggleUmbrellaGoal, 'No umbrella goals yet. Compile or create one first.')}
      </div>
      <div>
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Linked ideas / vehicles</div>
        {renderChips(vehicleIdeas, assessment.relatedIdeaIds, onToggleIdea, 'No ideas yet. Promote a note or compile one first.')}
      </div>

      {linkedIdeas.length > 0 && (
        <div className="rounded-2xl border border-dashed border-violet-200/90 bg-violet-50/60 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Incubation links</div>
          <div className="flex flex-wrap gap-2">
            {linkedIdeas.map((idea) => (
              <Link
                key={idea.id}
                to={`/incubation?idea=${idea.id}&note=${note.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 transition-colors hover:border-violet-300 hover:text-violet-900 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:text-violet-200"
              >
                View {idea.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InboxPage() {
  const [newNote, setNewNote] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [newSectionName, setNewSectionName] = useState('');
  const [compilingNoteId, setCompilingNoteId] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [captureHint, setCaptureHint] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isImportingMarkdown, setIsImportingMarkdown] = useState(false);
  const [snapshotImportPreview, setSnapshotImportPreview] = useState<SnapshotImportPreview | null>(null);
  const [snapshotImportMode, setSnapshotImportMode] = useState<SnapshotImportMode>('merge');
  const [snapshotImportError, setSnapshotImportError] = useState<string | null>(null);
  const [isImportingSnapshot, setIsImportingSnapshot] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [expandedExtractionNoteId, setExpandedExtractionNoteId] = useState<string | null>(null);
  const [compileDraft, setCompileDraft] = useState<CompileDraft | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusNoteId = searchParams.get('note');
  const { notes, ideas, addNote, updateNote, deleteNote, addIdea, addSection, sections, capabilityBets, projects, goals } = useAppStore();
  const activeCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !bet.archivedAt), [capabilityBets]);

  const [selectedTensionModeId, setSelectedTensionModeId] = useState<string | null>(null);

  const activeMode = useMemo(() => TENSION_MODES.find(m => m.id === selectedTensionModeId) || null, [selectedTensionModeId]);

  const handleSurpriseMe = () => {
    const randomMode = TENSION_MODES[Math.floor(Math.random() * TENSION_MODES.length)];
    const randomPrompt = randomMode.prompts[Math.floor(Math.random() * randomMode.prompts.length)];
    
    setSelectedTensionModeId(randomMode.id);
    setNewNote(`${randomMode.icon} ${randomMode.label}: ${randomPrompt}`);
    
    const textarea = document.querySelector('textarea');
    if (textarea) {
      textarea.focus();
    }
  };

  const textareaBorderRingClass = useMemo(() => {
    if (activeMode) {
      return `${activeMode.borderClass} ${activeMode.ringClass} ${activeMode.focusBorderClass}`;
    }
    if (selectedTensionModeId === 'context') {
      return 'border-violet-350 dark:border-violet-800/60 focus:ring-violet-500/20 dark:focus:ring-violet-500/10 focus:border-violet-400 dark:focus:border-violet-700';
    }
    return 'border-stone-200 dark:border-stone-800 focus:ring-stone-900/5 dark:focus:ring-stone-100/5 focus:border-stone-400 dark:focus:border-stone-700';
  }, [activeMode, selectedTensionModeId]);

  // Generate dynamic suggestive prompts
  const suggestivePrompts = useMemo(() => {
    const list: { id: string; category: string; text: string; prefill: string }[] = [];

    const activeProjects = projects.filter(p => p.status === 'Active');
    const activeGoals = goals.filter(g => g.status === 'Active');
    const incubatingIdeas = ideas.filter(idea => idea.type === 'Concept' && (idea.stage === 'Seed' || idea.stage === 'Sprouting'));
    const activeBets = capabilityBets.filter(bet => !bet.archivedAt);

    activeProjects.forEach(p => {
      list.push({
        id: `project-${p.id}`,
        category: 'Active Project',
        text: `What was the main outcome, win, or blocker on project '${p.title}' today?`,
        prefill: `Regarding project [${p.title}]: `
      });
    });

    activeGoals.forEach(g => {
      list.push({
        id: `goal-${g.id}`,
        category: 'Active Goal',
        text: `What progress did you make toward your goal '${g.title}' today?`,
        prefill: `Regarding goal [${g.title}]: `
      });
    });

    incubatingIdeas.slice(0, 2).forEach(idea => {
      list.push({
        id: `dream-${idea.id}`,
        category: 'Incubating Dream',
        text: `Any new exposure, signal, or pull for the dream '${idea.title}'?`,
        prefill: `Regarding dream [${idea.title}]: `
      });
    });

    activeBets.slice(0, 2).forEach(bet => {
      list.push({
        id: `bet-${bet.id}`,
        category: 'Capability Bet',
        text: `Any fresh evidence matching or complicating the thesis: '${bet.title}'?`,
        prefill: `Regarding capability bet [${bet.title}]: `
      });
    });

    // Default general reflection prompts
    list.push({
      id: 'general-1',
      category: 'General Reflection',
      text: 'What kept returning to your mind or orbiting in the background today?',
      prefill: 'Orbiting my mind today: '
    });
    list.push({
      id: 'general-2',
      category: 'General Reflection',
      text: 'What task, decision, or topic have you actively avoided thinking about today?',
      prefill: 'Avoided topic/decision: '
    });
    list.push({
      id: 'general-3',
      category: 'General Reflection',
      text: 'What is something you want right now, but feel hesitant or conflicted to pursue?',
      prefill: 'Desire/Conflict: '
    });
    list.push({
      id: 'general-4',
      category: 'General Reflection',
      text: 'What is currently drawing your attention or curiosity, even if you cannot explain why yet?',
      prefill: 'Curiosity/Pull: '
    });
    list.push({
      id: 'general-5',
      category: 'General Reflection',
      text: 'What is the biggest active tension or blocker you are facing right now?',
      prefill: 'Current tension: '
    });

    return list;
  }, [projects, goals, ideas, capabilityBets]);

  const compileSourceNote = useMemo(
    () => notes.find((note) => note.id === compileDraft?.noteId) ?? null,
    [compileDraft?.noteId, notes]
  );

  useEffect(() => {
    if (!focusNoteId) return;

    const target = document.getElementById(`note-${focusNoteId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusNoteId, notes.length]);

  useEffect(() => () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
  }, [pendingImagePreview]);

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const createSectionFromDraft = () => {
    const name = newSectionName.trim().replace(/\s+/g, ' ');
    if (!name) return null;
    const existing = sections.find((section) => section.name.trim().toLowerCase() === name.toLowerCase());
    if (existing) {
      setSelectedSectionId(existing.id);
      setNewSectionName('');
      return existing.id;
    }
    const id = addSection({
      name,
      color: colorForNewSection(sections),
    });
    setSelectedSectionId(id);
    setNewSectionName('');
    return id;
  };

  const stageImage = (file?: File) => {
    if (!file || isAnalyzingImage || !file.type.startsWith('image/')) return;
    setImageError(null);
    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const importMarkdown = async (file?: File) => {
    if (!file || isImportingMarkdown) return;

    setImageError(null);
    setIsImportingMarkdown(true);
    try {
      if (!file.name.toLowerCase().endsWith('.md')) {
        throw new Error('Choose a Markdown file ending in .md.');
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Markdown files must be 2 MB or smaller.');
      }

      const content = (await file.text()).trim();
      if (!content) {
        throw new Error('That Markdown file is empty.');
      }

      addNote(content);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'HumanBoard could not import that Markdown file.');
    } finally {
      setIsImportingMarkdown(false);
    }
  };

  const stageSnapshotImport = async (file?: File) => {
    if (!file || isImportingSnapshot) return;
    setSnapshotImportError(null);
    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        throw new Error('Choose a HumanBoard snapshot JSON file.');
      }
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('Snapshot files must be 25 MB or smaller.');
      }
      setSnapshotImportPreview({
        fileName: file.name,
        snapshot: parseSnapshotImport(await file.text()),
      });
      setSnapshotImportMode('merge');
    } catch (error) {
      setSnapshotImportError(error instanceof Error ? error.message : 'HumanBoard could not read that snapshot.');
    }
  };

  const importSnapshot = async () => {
    if (!snapshotImportPreview || isImportingSnapshot) return;
    setSnapshotImportError(null);
    setIsImportingSnapshot(true);
    try {
      const currentResponse = await apiFetch('/api/snapshot', { cache: 'no-store' });
      if (!currentResponse.ok) throw new Error('HumanBoard could not load the current cloud snapshot.');
      const current = parseSnapshotImport(await currentResponse.text());
      const next = buildImportedSnapshot(current, snapshotImportPreview.snapshot, snapshotImportMode);
      const saveResponse = await apiFetch('/api/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!saveResponse.ok) throw new Error('HumanBoard could not save the imported snapshot.');
      await hydrateAppStoreFromRepository();
      setSnapshotImportPreview(null);
    } catch (error) {
      setSnapshotImportError(error instanceof Error ? error.message : 'HumanBoard could not import that snapshot.');
    } finally {
      setIsImportingSnapshot(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingImage) {
      setImageError(null);
      setIsAnalyzingImage(true);
      try {
        addNote(await createNoteFromImage(pendingImage, newNote));
        setNewNote('');
        clearPendingImage();
      } catch (error) {
        setImageError(error instanceof Error ? error.message : 'HumanBoard could not create a note from that image.');
      } finally {
        setIsAnalyzingImage(false);
      }
      return;
    }
    if (!newNote.trim()) {
      setCaptureHint('Write a thought or attach an image before adding it to Inbox.');
      document.querySelector<HTMLTextAreaElement>('textarea')?.focus();
      return;
    }
    if (!shouldTreatAsMeaningfulNote(newNote)) {
      setImageError('This looks accidental or too low-signal to save as a note.');
      setCaptureHint('HumanBoard skipped a likely accidental or nonsense input.');
      return;
    }
    addNote(newNote);
    setNewNote('');
    setCaptureHint(null);
    setImageError(null);
  };

  const promoteToIdea = (noteId: string, noteContent: string) => {
    addIdea({
      title: noteContent.split('\n')[0].substring(0, 40) + (noteContent.length > 40 ? '...' : ''),
      summary: noteContent.substring(0, 100) + (noteContent.length > 100 ? '...' : ''),
      content: noteContent,
      type: 'Concept',
      stage: 'Seed',
      sectionId: selectedSectionId || undefined,
      confidence: 5,
      maturity: 0,
      linkedNoteIds: [noteId],
      relatedIdeaIds: [],
    });
    deleteNote(noteId);
    setSelectedSectionId('');
  };

  const saveAsPrinciple = (noteId: string, noteContent: string) => {
    addIdea({
      title: noteContent.split('\n')[0].substring(0, 40) + (noteContent.length > 40 ? '...' : ''),
      summary: noteContent.substring(0, 100) + (noteContent.length > 100 ? '...' : ''),
      content: noteContent,
      type: 'Principle',
      stage: 'Evergreen',
      sectionId: selectedSectionId || undefined,
      confidence: 10,
      maturity: 100,
      linkedNoteIds: [noteId],
      relatedIdeaIds: [],
    });
    deleteNote(noteId);
    setSelectedSectionId('');
  };

  const compileToKnowledge = async (noteId: string, noteContent: string) => {
    setCompileError(null);
    setCompilingNoteId(noteId);
    try {
      const compiled = await compileRawNoteToKnowledge(noteContent);
      setCompileDraft({
        noteId,
        title: compiled.title || noteContent.split('\n')[0].slice(0, 72),
        summary: compiled.summary || noteContent.slice(0, 140),
        content: compiled.content || noteContent,
        type: compiled.type || 'Reference',
        stage: compiled.stage || 'Sprouting',
        confidence: Math.max(1, Math.min(10, Number(compiled.confidence) || 7)),
        maturity: Math.max(0, Math.min(100, Number(compiled.maturity) || 55)),
        nextAction: compiled.nextAction || 'Review and refine this compiled knowledge page.',
        tags: Array.isArray(compiled.tags)
          ? compiled.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
          : [],
        sourceNoteExcerpt: String(compiled.sourceNoteExcerpt || noteContent.slice(0, 220)).trim(),
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

  const updateSignalLinks = (noteId: string, field: 'relatedBaseSkillIds' | 'relatedUmbrellaGoalIds' | 'relatedIdeaIds', ideaId: string) => {
    const note = notes.find((entry) => entry.id === noteId);
    if (!note?.signalAssessment) return;

    updateNote(noteId, {
      signalAssessment: {
        ...note.signalAssessment,
        [field]: toggleId(note.signalAssessment[field], ideaId),
      },
    });
  };

  const updateCapabilityLinks = (noteId: string, betId: string) => {
    const note = notes.find((entry) => entry.id === noteId);
    if (!note) return;

    updateNote(noteId, {
      capabilityBetIds: toggleId(note.capabilityBetIds, betId),
    });
  };

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
      horizon: 'Mid' as const,
      thesis: summary,
      whyItMatters: summary,
      relatedBaseSkillIds: [] as string[],
      relatedUmbrellaGoalIds: [] as string[],
      relatedIdeaIds: [] as string[],
    };
  };

  const runExtractionReview = async (note: Note) => {
    setReviewError(null);
    setReviewingNoteId(note.id);
    setExpandedExtractionNoteId(note.id);

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
      setReviewError(`Extraction review failed. HumanBoard could not propose evidence candidates right now. ${detail}`);
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
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-4 py-6 sm:p-8 flex flex-col h-full transition-colors duration-300">
      <header className="mb-8 sm:mb-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">Raw capture</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Inbox</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Fast capture for raw thoughts that have not been compiled into knowledge yet.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800">
          <Upload className="h-4 w-4" />
          Import snapshot
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            disabled={isImportingSnapshot}
            onChange={(event) => {
              void stageSnapshotImport(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </header>

      <div className="mb-6">
        <DailySynthesisCard />
      </div>
      {snapshotImportError && !snapshotImportPreview && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {snapshotImportError}
        </div>
      )}

      <form onSubmit={handleAdd} className="mb-12" data-tour="tour-inbox-capture">
        {/* Suggestive Tabs Row */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.2em] block">
              Select a raw material catalyst
            </span>
            {selectedTensionModeId && (
              <button
                type="button"
                onClick={() => {
                  setSelectedTensionModeId(null);
                  if (activeMode && newNote === activeMode.prefill) {
                    setNewNote('');
                  }
                }}
                className="text-[10px] font-bold text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 uppercase tracking-widest cursor-pointer transition-colors"
              >
                Reset Mode
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {TENSION_MODES.map((mode) => {
              const isSelected = selectedTensionModeId === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setSelectedTensionModeId(null);
                      if (newNote === mode.prefill) {
                        setNewNote('');
                      }
                    } else {
                      setSelectedTensionModeId(mode.id);
                      if (!newNote.trim() || TENSION_MODES.some(m => newNote === m.prefill)) {
                        setNewNote(mode.prefill);
                      }
                      const textarea = document.querySelector('textarea');
                      if (textarea) textarea.focus();
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer select-none ${
                    isSelected
                      ? mode.activeClass
                      : 'border-stone-200 dark:border-stone-850 bg-white dark:bg-stone-900/60 hover:bg-stone-50 dark:hover:bg-stone-805 text-stone-600 dark:text-stone-400'
                  }`}
                >
                  <span>{mode.icon}</span>
                  <span>{mode.label}</span>
                </button>
              );
            })}
            
            {/* Active Context Tab */}
            <button
              type="button"
              onClick={() => {
                setSelectedTensionModeId(selectedTensionModeId === 'context' ? null : 'context');
                const textarea = document.querySelector('textarea');
                if (textarea) textarea.focus();
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer select-none ${
                selectedTensionModeId === 'context'
                  ? 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 shadow-[0_0_12px_-3px_rgba(139,92,246,0.15)]'
                  : 'border-stone-200 dark:border-stone-850 bg-white dark:bg-stone-900/60 hover:bg-stone-50 dark:hover:bg-stone-805 text-stone-600 dark:text-stone-400'
              }`}
            >
              <span>🎯</span>
              <span>Focus Context</span>
            </button>

            {/* Surprise Me Button */}
            <button
              type="button"
              onClick={handleSurpriseMe}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-dashed border-amber-300 dark:border-amber-700/50 bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-100/60 dark:hover:bg-amber-950/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ml-auto"
            >
              <Dices className="h-3.5 w-3.5" />
              <span>Surprise Me</span>
            </button>
          </div>
        </div>

        <div className="relative group">
          {pendingImagePreview && (
            <div className="absolute left-4 top-4 z-10">
              <div className="relative h-20 w-20 overflow-hidden rounded-md border border-stone-300 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <img src={pendingImagePreview} alt="Pending note attachment" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={clearPendingImage}
                  className="absolute right-1 top-1 rounded-full bg-stone-950/80 p-1 text-white hover:bg-stone-950"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <textarea
            value={newNote}
            onChange={(e) => {
              setNewNote(e.target.value);
              if (captureHint) setCaptureHint(null);
            }}
            onPaste={(event) => {
              const image = getClipboardImage(event.clipboardData);
              if (!image) return;
              event.preventDefault();
              stageImage(image);
            }}
            placeholder={activeMode ? `Write your ${activeMode.label.toLowerCase()} reflection...` : "What's on your mind? Capture raw thoughts, tensions, obsessions, or conflicts here..."}
            className={`w-full bg-stone-50 dark:bg-stone-900/50 border rounded-xl p-6 pr-14 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:ring-4 transition-all resize-none min-h-[160px] text-lg leading-relaxed shadow-sm group-hover:shadow-md ${textareaBorderRingClass} ${pendingImagePreview ? 'pt-28' : ''}`}
            onKeyDown={(e) => {
              if (pendingImage && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleAdd(e);
                return;
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                void handleAdd(e);
              }
            }}
          />
          <div className="absolute bottom-4 right-4 flex items-center gap-2">
            <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600 tracking-widest hidden sm:inline-block uppercase">⌘+Enter</span>
            <label
              className="cursor-pointer rounded-lg border border-stone-200 bg-white p-2.5 text-stone-600 shadow-sm transition-all hover:bg-stone-100 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              title="Create note from image"
            >
              {isAnalyzingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={isAnalyzingImage}
                onChange={(event) => {
                  stageImage(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <label
              className="cursor-pointer rounded-lg border border-stone-200 bg-white p-2.5 text-stone-600 shadow-sm transition-all hover:bg-stone-100 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
              title="Import Markdown into Inbox"
            >
              {isImportingMarkdown ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
              <input
                type="file"
                accept=".md,text/markdown,text/x-markdown"
                className="sr-only"
                disabled={isImportingMarkdown}
                onChange={(event) => {
                  void importMarkdown(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="submit"
              disabled={isAnalyzingImage || isImportingMarkdown}
              aria-label={newNote.trim() || pendingImage ? 'Add note to Inbox' : 'Focus Inbox capture'}
              title={newNote.trim() || pendingImage ? 'Add note to Inbox' : 'Write a thought or attach an image first'}
              className="p-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
        {imageError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{imageError}</p>}
        {captureHint && <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">{captureHint}</p>}

        {/* Interactive Payoff Panel */}
        {selectedTensionModeId && (
          <div className={`mt-4 p-5 rounded-2xl border transition-all duration-300 animate-slide-down ${
            activeMode 
              ? `${activeMode.bgClass} ${activeMode.borderClass} ${activeMode.textClass}`
              : 'bg-violet-50/50 dark:bg-violet-950/10 border-violet-200 dark:border-violet-850 text-violet-950 dark:text-violet-105'
          }`}>
            {activeMode ? (
              <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                      Subconscious Payoff: {activeMode.payoffTitle}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    {activeMode.payoffDesc}
                  </p>
                </div>
                
                <div className="w-full md:w-auto shrink-0 md:max-w-xs space-y-2">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400 block">
                    Catalyst Prompts (click to write)
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {activeMode.prompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setNewNote(`${activeMode.icon} ${activeMode.label}: ${prompt}`);
                          const textarea = document.querySelector('textarea');
                          if (textarea) textarea.focus();
                        }}
                        className="text-left text-xs font-semibold px-3 py-2 rounded-xl bg-white/70 hover:bg-white border border-stone-200/50 hover:border-stone-300 dark:bg-stone-900/60 dark:hover:bg-stone-900 dark:border-stone-800 dark:hover:border-stone-700 text-stone-700 dark:text-stone-300 transition-colors shadow-sm select-none cursor-pointer flex items-center justify-between gap-2 group/btn"
                      >
                        <span className="line-clamp-2 leading-relaxed">"{prompt}"</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/btn:opacity-100 transform translate-x-1 group-hover/btn:translate-x-0 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedTensionModeId === 'context' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-violet-500 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-700 dark:text-violet-300">
                    Active Focus Context Prompts
                  </span>
                </div>
                <p className="text-sm text-stone-600 dark:text-stone-350 max-w-2xl leading-relaxed">
                  Select a context prompt calibrated to your active projects, goals, or bets. The engine will associate your note with the selected item.
                </p>
                
                {suggestivePrompts.length === 0 ? (
                  <div className="text-xs text-stone-500 dark:text-stone-400 italic py-2">
                    No active projects, goals, or bets yet. Define some to see custom context prompts here.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 max-h-[220px] overflow-y-auto pr-1">
                    {suggestivePrompts.map((prompt) => (
                      <button
                        key={prompt.id}
                        type="button"
                        onClick={() => {
                          setNewNote(prompt.prefill);
                          const textarea = document.querySelector('textarea');
                          if (textarea) textarea.focus();
                        }}
                        className="text-left text-xs font-semibold px-4 py-3 rounded-xl bg-white/70 hover:bg-white border border-stone-200/50 hover:border-stone-350 dark:bg-stone-900/60 dark:hover:bg-stone-900 dark:border-stone-800 dark:hover:border-stone-750 text-stone-700 dark:text-stone-300 transition-colors shadow-sm select-none cursor-pointer flex flex-col gap-1 group/btn"
                      >
                        <span className="text-[9px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                          {prompt.category}
                        </span>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span className="leading-relaxed">"{prompt.text}"</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 group-hover/btn:opacity-100 transform translate-x-1 group-hover/btn:translate-x-0 transition-all text-violet-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </form>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2 scrollbar-hide">
        {compileError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-500 dark:text-red-400 mb-2">Compile error</div>
                <p className="leading-relaxed">{compileError}</p>
              </div>
              <button
                type="button"
                onClick={() => setCompileError(null)}
                className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 dark:hover:text-red-200"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {reviewError && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400 mb-2">Extraction review error</div>
                <p className="leading-relaxed">{reviewError}</p>
              </div>
              <button
                type="button"
                onClick={() => setReviewError(null)}
                className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-amber-600 hover:text-amber-800 dark:hover:text-amber-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {compileDraft && (
          <div className="mb-8 rounded-3xl border border-emerald-200 bg-emerald-50/80 p-6 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-600 dark:text-emerald-400 mb-2">Compile preview</div>
                <h2 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{compileDraft.title || 'Untitled compiled artifact'}</h2>
                <p className="text-sm text-stone-600 dark:text-stone-400 mt-2 max-w-2xl leading-relaxed">Review this compiled artifact before saving it into the knowledge layer.</p>
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
                  className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Type</span>
                <select
                  value={compileDraft.type}
                  onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, type: e.target.value as IdeaType } : draft))}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                >
                  {COMPILE_TYPE_LABELS.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Suggested area</span>
                  <select
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  >
                    <option value="">No Area</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>{section.name}</option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="Create new area"
                    className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={createSectionFromDraft}
                    className="rounded-xl border border-emerald-200 px-4 py-3 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
                  >
                    Add area
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Why this type</span>
                <textarea
                  value={compileDraft.compileReason}
                  onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, compileReason: e.target.value } : draft))}
                  className="w-full min-h-[96px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Source excerpt</span>
                <textarea
                  value={compileDraft.sourceNoteExcerpt}
                  onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, sourceNoteExcerpt: e.target.value } : draft))}
                  className="w-full min-h-[96px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-4">
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Confidence (1-10)</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={compileDraft.confidence}
                  onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, confidence: Number(e.target.value) } : draft))}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Maturity (0-100)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={compileDraft.maturity}
                  onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, maturity: Number(e.target.value) } : draft))}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                />
              </label>
            </div>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Title</span>
              <input
                type="text"
                value={compileDraft.title}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, title: e.target.value } : draft))}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Summary</span>
              <textarea
                value={compileDraft.summary}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, summary: e.target.value } : draft))}
                className="w-full min-h-[96px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Compiled content</span>
              <textarea
                value={compileDraft.content}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, content: e.target.value } : draft))}
                className="w-full min-h-[220px] rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-relaxed text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Next action</span>
              <input
                type="text"
                value={compileDraft.nextAction}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, nextAction: e.target.value } : draft))}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
              />
            </label>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Tags</span>
              <input
                type="text"
                value={compileDraft.tags.join(', ')}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 6) } : draft))}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                placeholder="strategy, workflow, research"
              />
            </label>

            <label className="block mb-4">
              <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Open questions (one per line)</span>
              <textarea
                value={compileDraft.openQuestions.join('\n')}
                onChange={(e) => setCompileDraft((draft) => (draft ? { ...draft, openQuestions: e.target.value.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 5) } : draft))}
                className="w-full min-h-[110px] rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 focus:outline-none focus:ring-4 focus:ring-emerald-900/5 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                placeholder="What still needs verification?&#10;What decision is still open?"
              />
            </label>

            {compileSourceNote && (
              <div className="rounded-2xl border border-dashed border-emerald-300/80 bg-white/70 px-4 py-4 dark:border-emerald-900/60 dark:bg-stone-900/40">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400 mb-2">Linked source note</div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">{compileSourceNote.content}</p>
              </div>
            )}
          </div>
        )}

        {snapshotImportPreview && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-lg border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Snapshot preview</div>
                  <h2 className="mt-2 text-xl font-semibold text-stone-900 dark:text-stone-100">{snapshotImportPreview.fileName}</h2>
                </div>
                <button type="button" onClick={() => setSnapshotImportPreview(null)} className="rounded-md p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900" aria-label="Close snapshot import">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {Object.entries(snapshotImportCounts(snapshotImportPreview.snapshot)).map(([label, count]) => (
                  <div key={label} className="rounded-md border border-stone-200 px-3 py-3 dark:border-stone-800">
                    <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">{count}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">{label.replace(/([A-Z])/g, ' $1')}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setSnapshotImportMode('merge')} className={`flex items-start gap-3 rounded-lg border p-4 text-left ${snapshotImportMode === 'merge' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-stone-200 dark:border-stone-800'}`}>
                  <GitMerge className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <span><strong className="block text-sm text-stone-900 dark:text-stone-100">Merge</strong><span className="mt-1 block text-xs text-stone-500">Keep current vault data and skip duplicates.</span></span>
                </button>
                <button type="button" onClick={() => setSnapshotImportMode('replace')} className={`flex items-start gap-3 rounded-lg border p-4 text-left ${snapshotImportMode === 'replace' ? 'border-red-500 bg-red-50 dark:bg-red-950/30' : 'border-stone-200 dark:border-stone-800'}`}>
                  <Replace className="mt-0.5 h-4 w-4 text-red-600" />
                  <span><strong className="block text-sm text-stone-900 dark:text-stone-100">Replace</strong><span className="mt-1 block text-xs text-stone-500">Overwrite current vault board data.</span></span>
                </button>
              </div>

              {snapshotImportError && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{snapshotImportError}</p>}

              <div className="mt-6 flex justify-end gap-2">
                <button type="button" onClick={() => setSnapshotImportPreview(null)} className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900">Cancel</button>
                <button type="button" onClick={() => void importSnapshot()} disabled={isImportingSnapshot} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${snapshotImportMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {isImportingSnapshot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {snapshotImportMode === 'replace' ? 'Replace vault' : 'Merge snapshot'}
                </button>
              </div>
            </div>
          </div>
        )}



        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.2em]">Recent Notes</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">Classify to:</span>
            <select 
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-600 dark:text-stone-400 focus:outline-none"
            >
              <option value="">No Area</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="New area"
              className="min-w-[8rem] rounded-lg border border-stone-200 bg-white px-3 py-1 text-[10px] font-medium text-stone-700 focus:outline-none dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200"
            />
            <button
              type="button"
              onClick={createSectionFromDraft}
              className="rounded-lg border border-emerald-200 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-900/60 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              Add area
            </button>
          </div>
        </div>
        <div className="space-y-6">
          {notes.length === 0 ? (
            <AdaptiveDashboard
              projects={projects}
              goals={goals}
              ideas={ideas}
              capabilityBets={capabilityBets}
              onSelectPrompt={(prefill, modeId) => {
                setNewNote(prefill);
                setSelectedTensionModeId(modeId);
                const textarea = document.querySelector('textarea');
                if (textarea) {
                  textarea.focus();
                }
              }}
            />
          ) : (
            notes.map(note => {
              const isFocused = focusNoteId === note.id;
              const isExtractionOpen = expandedExtractionNoteId === note.id || Boolean(note.extractionReview);

              return (
                <div id={`note-${note.id}`} key={note.id} className={`group rounded-xl border p-6 transition-all ${isFocused ? 'border-violet-400 bg-violet-50/70 shadow-lg shadow-violet-900/10 dark:border-violet-500 dark:bg-violet-950/30' : 'bg-white border-stone-200 hover:border-stone-300 hover:shadow-xl hover:shadow-stone-900/[0.02] dark:bg-stone-900/40 dark:border-stone-800 dark:hover:border-stone-700 dark:hover:shadow-black/20'}`}>
                  <p className="text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-relaxed text-lg">{note.content}</p>
                  {(note.signalAssessment || note.capabilityBetIds?.length || note.capabilityEvidenceSummary) && (
                    <div className="mt-4 space-y-3">
                      {note.signalAssessment && (
                        <div className="rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/20">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700 dark:text-violet-300">Signal assessment</span>
                        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300">
                          {note.signalAssessment.direction}
                        </span>
                        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300">
                          {note.signalAssessment.horizon}
                        </span>
                        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300">
                          strength {note.signalAssessment.strength}/10
                        </span>
                        <span className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300">
                          confidence {note.signalAssessment.confidence}/10
                        </span>
                      </div>
                      {(note.signalAssessment.thesis || note.signalAssessment.whyItMatters) && (
                        <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                          {note.signalAssessment.thesis || note.signalAssessment.whyItMatters}
                        </p>
                      )}
                          <SignalLinkEditor
                            note={note}
                            onToggleBaseSkill={(ideaId) => updateSignalLinks(note.id, 'relatedBaseSkillIds', ideaId)}
                            onToggleUmbrellaGoal={(ideaId) => updateSignalLinks(note.id, 'relatedUmbrellaGoalIds', ideaId)}
                            onToggleIdea={(ideaId) => updateSignalLinks(note.id, 'relatedIdeaIds', ideaId)}
                          />
                        </div>
                      )}

                      <CapabilityEvidenceEditor
                        note={note}
                        capabilityBets={activeCapabilityBets}
                        onToggleCapabilityBet={(betId) => updateCapabilityLinks(note.id, betId)}
                        onChangePolarity={(polarity) => updateNote(note.id, { capabilityEvidencePolarity: polarity })}
                        onChangeSummary={(summary) => updateNote(note.id, { capabilityEvidenceSummary: summary })}
                      />
                    </div>
                  )}

                  {isExtractionOpen && (
                    <div className="mt-4">
                      <ExtractionReviewPanel
                        note={note}
                        capabilityBets={activeCapabilityBets}
                        ideas={ideas}
                        onRunReview={() => void runExtractionReview(note)}
                        onAcceptCapability={(candidateId) => acceptCapabilityCandidate(note, candidateId)}
                        onRejectCapability={(candidateId) => rejectCapabilityCandidate(note, candidateId)}
                        onAcceptIdea={(candidateId) => acceptIdeaCandidate(note, candidateId)}
                        onRejectIdea={(candidateId) => rejectIdeaCandidate(note, candidateId)}
                        isRunning={reviewingNoteId === note.id}
                        compact
                      />
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600 uppercase tracking-wider">
                        {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                      </span>
                      {isFocused && (
                        <button
                          type="button"
                          onClick={() => setSearchParams((params) => {
                            const next = new URLSearchParams(params);
                            next.delete('note');
                            return next;
                          })}
                          className="rounded-full border border-violet-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:border-violet-800 dark:bg-stone-900 dark:text-violet-300"
                        >
                          focused
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                      <button 
                        onClick={() => setExpandedExtractionNoteId((current) => current === note.id ? null : note.id)}
                        className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <Sparkles className="w-3 h-3" />
                        {isExtractionOpen ? 'Hide review' : note.extractionReview ? 'Review' : 'Extract'}
                      </button>
                      <button 
                        onClick={() => void compileToKnowledge(note.id, note.content)}
                        disabled={compilingNoteId === note.id}
                        className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-60"
                      >
                        <Sparkles className="w-3 h-3" />
                        {compilingNoteId === note.id ? 'Compiling...' : 'Compile'}
                      </button>
                      <button 
                        onClick={() => promoteToIdea(note.id, note.content)}
                        className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <Lightbulb className="w-3 h-3" />
                        Idea
                      </button>
                      <button 
                        onClick={() => saveAsPrinciple(note.id, note.content)}
                        className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      >
                        <Scale className="w-3 h-3" />
                        Principle
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this note?')) {
                            deleteNote(note.id);
                          }
                        }}
                        className="text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
