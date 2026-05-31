import { useEffect, useMemo, useState } from 'react';
import { useAppStore, type CapabilityBet, type EvidencePolarity, type IdeaType, type Note, type SignalAssessment } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Archive, Lightbulb, Scale, Sparkles, Check, X } from 'lucide-react';
import { compileRawNoteToKnowledge, extractCapabilityEvidenceReview } from '../lib/ai';
import { Link, useSearchParams } from 'react-router-dom';
import ExtractionReviewPanel from '../components/capability/ExtractionReviewPanel';

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

const COMPILE_TYPE_LABELS: IdeaType[] = ['Concept', 'Principle', 'Reference', 'Project', 'Question', 'Action', 'Base Skill', 'Umbrella Goal'];

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
  const [compilingNoteId, setCompilingNoteId] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewingNoteId, setReviewingNoteId] = useState<string | null>(null);
  const [expandedExtractionNoteId, setExpandedExtractionNoteId] = useState<string | null>(null);
  const [compileDraft, setCompileDraft] = useState<CompileDraft | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const focusNoteId = searchParams.get('note');
  const { notes, ideas, addNote, updateNote, deleteNote, addIdea, sections, capabilityBets } = useAppStore();
  const activeCapabilityBets = useMemo(() => capabilityBets.filter((bet) => !bet.archivedAt), [capabilityBets]);

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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addNote(newNote);
    setNewNote('');
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
    <div className="max-w-3xl mx-auto w-full p-8 flex flex-col h-full transition-colors duration-300">
      <header className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] px-3 py-1 rounded-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">Raw capture</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Inbox</h1>
        <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Fast capture for raw thoughts that have not been compiled into knowledge yet.</p>
      </header>

      <form onSubmit={handleAdd} className="mb-12">
        <div className="relative group">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-6 pr-14 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-4 focus:ring-stone-900/5 dark:focus:ring-stone-100/5 focus:border-stone-400 dark:focus:border-stone-700 transition-all resize-none min-h-[160px] text-lg leading-relaxed shadow-sm group-hover:shadow-md"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAdd(e);
              }
            }}
          />
          <div className="absolute bottom-4 right-4 flex items-center gap-3">
            <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600 tracking-widest hidden sm:inline-block uppercase">⌘+Enter</span>
            <button
              type="submit"
              disabled={!newNote.trim()}
              className="p-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
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

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.2em]">Recent Notes</h2>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
        <div className="space-y-6">
          {notes.length === 0 ? (
            <div className="text-center py-16 text-stone-400 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-stone-50/50 dark:bg-stone-900/20">
              <p className="text-sm italic">Inbox zero. Your mind is clear.</p>
            </div>
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
                        onClick={() => deleteNote(note.id)}
                        className="text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Archive className="w-3 h-3" />
                        Archive
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
