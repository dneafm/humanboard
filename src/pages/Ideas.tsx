import { useState } from 'react';
import { useAppStore, IdeaType, Idea } from '../store';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { LayoutGrid, List, Plus, Folder, Lightbulb, Scale, BookOpen, Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';

export default function IdeasPage() {
  const { ideas, sections } = useAppStore();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [activeType, setActiveType] = useState<IdeaType | 'All'>('All');

  const stages = ['Seed', 'Sprouting', 'Evergreen'];

  const filteredIdeas = ideas.filter(idea => {
    const matchesSearch = idea.title.toLowerCase().includes(search.toLowerCase()) || 
                         idea.summary.toLowerCase().includes(search.toLowerCase());
    const matchesType = activeType === 'All' || idea.type === activeType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="max-w-5xl mx-auto w-full p-8 flex flex-col h-full transition-colors duration-300">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Ideas & Principles</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Your living garden of concepts and values.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-stone-100 dark:bg-stone-900 rounded-lg p-1 border border-stone-200 dark:border-stone-800">
            <button
              onClick={() => setView('list')}
              className={cn("p-2 rounded-md transition-all", view === 'list' ? "bg-white dark:bg-stone-800 shadow-sm text-stone-900 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300")}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('board')}
              className={cn("p-2 rounded-md transition-all", view === 'board' ? "bg-white dark:bg-stone-800 shadow-sm text-stone-900 dark:text-stone-100" : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300")}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          <button className="flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10">
            <Plus className="w-4 h-4" />
            New
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 group-focus-within:text-stone-900 dark:group-focus-within:text-stone-100 transition-colors" />
          <input 
            type="text"
            placeholder="Search ideas, principles, or keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl py-3 pl-11 pr-4 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-all shadow-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
          {(['All', 'Concept', 'Principle', 'Reference'] as const).map(type => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border whitespace-nowrap",
                activeType === type 
                  ? "bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 border-stone-900 dark:border-stone-100 shadow-md" 
                  : "bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600"
              )}
            >
              {type === 'Concept' ? 'Ideas' : type === 'All' ? 'Everything' : type + 's'}
            </button>
          ))}
        </div>
      </div>

      {view === 'list' ? (
        <div className="space-y-6">
          {filteredIdeas.map(idea => {
            const section = sections.find(s => s.id === idea.sectionId);
            return <IdeaCard key={idea.id} idea={idea} section={section} />;
          })}
        </div>
      ) : (
        <div className="flex gap-8 overflow-x-auto pb-8 h-full scrollbar-hide">
          {stages.map(stage => (
            <div key={stage} className="flex-1 min-w-[320px] bg-stone-50/50 dark:bg-stone-900/10 rounded-2xl p-6 border border-stone-100 dark:border-stone-900/50">
              <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
                {stage}
                <span className="bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 px-2.5 py-0.5 rounded-full text-[10px]">
                  {filteredIdeas.filter(i => i.stage === stage).length}
                </span>
              </h3>
              <div className="space-y-4">
                {filteredIdeas.filter(i => i.stage === stage).map(idea => {
                  const section = sections.find(s => s.id === idea.sectionId);
                  return <IdeaCard key={idea.id} idea={idea} section={section} compact />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IdeaCard({ idea, section, compact }: { idea: Idea, section?: any, compact?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isPrinciple = idea.type === 'Principle';
  
  return (
    <motion.div 
      layout
      className={cn(
        "group bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl transition-all hover:shadow-xl hover:shadow-stone-900/[0.02] dark:hover:shadow-black/20",
        isPrinciple && "border-l-4 border-l-amber-400 dark:border-l-amber-500",
        !isPrinciple && section?.color && "border-l-4"
      )}
      style={!isPrinciple && section?.color ? { borderLeftColor: section.color.split(' ')[0].replace('bg-', '') } : {}}
    >
      <div className={cn("p-6", compact && "p-5")}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-2 rounded-lg",
              isPrinciple ? "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400" : "bg-stone-50 dark:bg-stone-800 text-stone-400 dark:text-stone-500"
            )}>
              {isPrinciple ? <Scale className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />}
            </div>
            <div>
              <h3 className={cn("text-xl font-semibold text-stone-900 dark:text-stone-100 leading-tight", compact && "text-base")}>{idea.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                {section && (
                  <span className={cn("text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1.5", section.color)}>
                    <Folder className="w-2.5 h-2.5" />
                    {section.name}
                  </span>
                )}
                <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  {idea.type}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!compact && (
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-stone-300 dark:text-stone-700 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
            <Link 
              to={`/ideas/${idea.id}`}
              className="p-2 text-stone-300 dark:text-stone-700 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-all"
              title="Open Full View"
            >
              <ExternalLink className="w-4 h-4" />
            </Link>
          </div>
        </div>
        
        <p className={cn("text-stone-600 dark:text-stone-400 text-base leading-relaxed", !isExpanded && "line-clamp-2", compact && "text-xs")}>{idea.summary}</p>
        
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 pb-8 border-t border-stone-100 dark:border-stone-800 prose prose-sm dark:prose-invert max-w-none mt-4">
                <ReactMarkdown>{idea.content}</ReactMarkdown>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!isPrinciple ? (
          <div className="mt-6">
            <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest mb-2">
              <span>Maturity</span>
              <span>{idea.maturity}%</span>
            </div>
            <div className="w-full h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-stone-900 dark:bg-stone-100 transition-all duration-700" 
                style={{ width: `${idea.maturity}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-6 text-amber-600/60 dark:text-amber-400/60">
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Foundational Principle</span>
          </div>
        )}

        {!compact && (
          <div className="flex items-center gap-6 text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500 mt-6">
            {!isPrinciple && (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-stone-700"></span>
                Confidence: {idea.confidence}/10
              </span>
            )}
            <span>Reviewed {formatDistanceToNow(new Date(idea.lastReviewed), { addSuffix: true })}</span>
            {idea.nextAction && (
              <span className="text-stone-800 dark:text-stone-200 truncate max-w-[250px]">
                Next: {idea.nextAction}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
