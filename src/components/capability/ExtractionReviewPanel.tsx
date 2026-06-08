import { formatDistanceToNow } from 'date-fns';
import { Check, Sparkles, X } from 'lucide-react';
import type { CapabilityBet, Idea, Note } from '../../store';

type ExtractionReviewPanelProps = {
  note: Note;
  capabilityBets: CapabilityBet[];
  ideas: Idea[];
  onRunReview: () => void;
  onAcceptCapability: (candidateId: string) => void;
  onRejectCapability: (candidateId: string) => void;
  onAcceptIdea: (candidateId: string) => void;
  onRejectIdea: (candidateId: string) => void;
  isRunning?: boolean;
  compact?: boolean;
};

function StatusPill({ status }: { status: 'pending' | 'accepted' | 'rejected' }) {
  const styles = status === 'accepted'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300'
    : status === 'rejected'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300'
      : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300';

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${styles}`}>
      {status}
    </span>
  );
}

export default function ExtractionReviewPanel({
  note,
  capabilityBets,
  ideas,
  onRunReview,
  onAcceptCapability,
  onRejectCapability,
  onAcceptIdea,
  onRejectIdea,
  isRunning = false,
  compact = false,
}: ExtractionReviewPanelProps) {
  const review = note.extractionReview;
  const pendingCapabilityCount = review?.capabilityCandidates.filter((candidate) => candidate.status === 'pending').length ?? 0;
  const pendingIdeaCount = review?.ideaCandidates.filter((candidate) => candidate.status === 'pending').length ?? 0;
  const activeCapabilityBets = capabilityBets.filter((bet) => !bet.archivedAt);

  return (
    <div className={`rounded-2xl border border-amber-200/80 bg-amber-50/70 ${compact ? 'px-4 py-4' : 'px-5 py-5'} dark:border-amber-900/40 dark:bg-amber-950/20`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-amber-700 dark:text-amber-300">Extraction review</div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Candidate links stay reviewable first. Conviction only moves after a candidate is accepted into the note.
          </p>
        </div>
        <button
          type="button"
          onClick={onRunReview}
          disabled={isRunning || (!activeCapabilityBets.length && !ideas.length)}
          className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isRunning ? 'Reviewing...' : review ? 'Rerun review' : 'Run review'}
        </button>
      </div>

      {review ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
            <span>Source {review.source}</span>
            <span>Generated {formatDistanceToNow(new Date(review.generatedAt), { addSuffix: true })}</span>
            <span>{pendingCapabilityCount + pendingIdeaCount} pending</span>
          </div>

          {(review.themes.length > 0 || review.entities.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Themes</div>
                <div className="flex flex-wrap gap-2">
                  {review.themes.length ? review.themes.map((theme) => (
                    <span key={theme} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                      {theme}
                    </span>
                  )) : <span className="text-xs text-stone-500 dark:text-stone-400">No themes suggested.</span>}
                </div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 dark:border-stone-800 dark:bg-stone-900/50">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Entities</div>
                <div className="flex flex-wrap gap-2">
                  {review.entities.length ? review.entities.map((entity) => (
                    <span key={entity} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                      {entity}
                    </span>
                  )) : <span className="text-xs text-stone-500 dark:text-stone-400">No entities suggested.</span>}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Capability evidence candidates</div>
            {review.capabilityCandidates.length ? review.capabilityCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{candidate.title}</div>
                      <StatusPill status={candidate.status} />
                      <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-300">
                        {candidate.polarity}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">
                        weight {candidate.suggestedWeight}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">{candidate.summary}</p>
                    <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{candidate.rationale}</p>
                  </div>
                  {candidate.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAcceptCapability(candidate.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 hover:border-emerald-300 hover:text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectCapability(candidate.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700 hover:border-rose-300 hover:text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                No capability evidence candidates were strong enough to suggest yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400 dark:text-stone-500">Idea and map-link candidates</div>
            {review.ideaCandidates.length ? review.ideaCandidates.map((candidate) => (
              <div key={candidate.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4 shadow-sm dark:border-stone-800 dark:bg-stone-900/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{candidate.title}</div>
                      <StatusPill status={candidate.status} />
                      <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/20 dark:text-violet-300">
                        {candidate.relation}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{candidate.rationale}</p>
                  </div>
                  {candidate.status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAcceptIdea(candidate.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-700 hover:border-emerald-300 hover:text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectIdea(candidate.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-rose-700 hover:border-rose-300 hover:text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                No additional map-link candidates were suggested yet.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-stone-200 px-4 py-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
          Run a review to propose capability evidence and idea links from this note before applying them to the board.
        </div>
      )}
    </div>
  );
}
