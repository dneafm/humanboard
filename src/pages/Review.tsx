import { useAppStore } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { Check, Sparkles, Archive, GitBranch, Clock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ReviewPage() {
  const { ideas } = useAppStore();
  
  // Mock a review queue: ideas that haven't been reviewed recently
  const reviewQueue = ideas.filter(i => {
    const daysSinceReview = (Date.now() - new Date(i.lastReviewed).getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceReview > 2; // Arbitrary threshold for demo
  });

  if (reviewQueue.length === 0) {
    return (
      <div className="max-w-3xl mx-auto w-full p-8 flex flex-col h-full items-center justify-center text-center">
        <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <Check className="w-8 h-8 text-stone-400" />
        </div>
        <h2 className="text-2xl font-semibold text-stone-900 mb-2">All caught up</h2>
        <p className="text-stone-500 max-w-md">Your ideas are fresh. Check back tomorrow for a new batch of resurfaced concepts.</p>
      </div>
    );
  }

  const currentIdea = reviewQueue[0];

  return (
    <div className="max-w-3xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Daily Review</h1>
          <p className="text-stone-500 mt-1">Resurfacing ideas to keep them alive.</p>
        </div>
        <div className="text-sm font-medium text-stone-400 bg-stone-100 px-3 py-1 rounded-full">
          1 of {reviewQueue.length}
        </div>
      </header>

      <div className="flex-1 flex flex-col">
        <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-500 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-blue-900">Why this surfaced</h4>
            <p className="text-sm text-blue-700 mt-1">You haven't looked at this in {formatDistanceToNow(new Date(currentIdea.lastReviewed))}. It has high confidence (7/10) but is still in the Sprouting stage.</p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-8 shadow-sm flex-1 mb-6 flex flex-col">
          <div className="mb-6">
            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 mb-4 inline-block">
              {currentIdea.stage}
            </span>
            <h2 className="text-2xl font-semibold text-stone-900 mb-2">{currentIdea.title}</h2>
            <p className="text-stone-600 leading-relaxed">{currentIdea.summary}</p>
          </div>

          {currentIdea.nextAction && (
            <div className="mt-auto bg-stone-50 rounded-lg p-4 border border-stone-100">
              <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Suggested Action</h4>
              <p className="text-sm text-stone-800">{currentIdea.nextAction}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-5 gap-3">
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors group">
            <Check className="w-5 h-5 text-stone-400 group-hover:text-green-600" />
            <span className="text-xs font-medium text-stone-600">Keep</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors group">
            <Sparkles className="w-5 h-5 text-stone-400 group-hover:text-blue-600" />
            <span className="text-xs font-medium text-stone-600">Sharpen</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors group">
            <Archive className="w-5 h-5 text-stone-400 group-hover:text-red-600" />
            <span className="text-xs font-medium text-stone-600">Archive</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors group">
            <GitBranch className="w-5 h-5 text-stone-400 group-hover:text-purple-600" />
            <span className="text-xs font-medium text-stone-600">Promote</span>
          </button>
          <button className="flex flex-col items-center justify-center gap-2 p-4 bg-white border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors group">
            <Clock className="w-5 h-5 text-stone-400 group-hover:text-amber-600" />
            <span className="text-xs font-medium text-stone-600">Snooze</span>
          </button>
        </div>
        
        <div className="mt-6 text-center">
          <Link to={`/ideas/${currentIdea.id}`} className="text-sm text-stone-500 hover:text-stone-900 inline-flex items-center gap-1">
            Open full idea <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
