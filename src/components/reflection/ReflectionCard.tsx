import { Check, ThumbsDown, X } from 'lucide-react';
import type { Reflection } from '../../store';

type Props = {
  reflection: Reflection;
  onDismiss: () => void;
  onFeedback: (feedback: 'useful' | 'not-useful') => void;
};

export default function ReflectionCard({ reflection, onDismiss, onFeedback }: Props) {
  return (
    <div className="rounded-3xl border border-violet-200 bg-violet-50/80 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-600 mb-2">Reflection</div>
          <h2 className="text-xl font-semibold tracking-tight text-stone-900">{reflection.pattern}</h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-full border border-violet-200 bg-white p-2 text-violet-500 hover:text-violet-700"
          aria-label="Dismiss reflection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 mb-2">Question</div>
          <p className="text-sm leading-relaxed text-stone-700">{reflection.question}</p>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 mb-2">Suggestion</div>
          <p className="text-sm leading-relaxed text-stone-700">{reflection.suggestion}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onFeedback('useful')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest ${reflection.feedback === 'useful' ? 'bg-violet-600 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}
        >
          <Check className="h-4 w-4" />
          Useful
        </button>
        <button
          type="button"
          onClick={() => onFeedback('not-useful')}
          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-widest ${reflection.feedback === 'not-useful' ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}
        >
          <ThumbsDown className="h-4 w-4" />
          Not useful
        </button>
      </div>
    </div>
  );
}
