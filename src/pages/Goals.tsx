import { useState, useRef, useEffect } from 'react';
import { useAppStore, Goal } from '../store';
import { Plus, Target, CheckCircle2, Circle, Clock, Sparkles, Trash2, ChevronRight, BookOpen, Lightbulb, ListTodo, RefreshCw, Wand2, AlignLeft, GitBranch, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { askGemma, generateGoalRoadmap } from '../lib/ai';
import ReactMarkdown from 'react-markdown';

export default function GoalsPage() {
  const { goals, addGoal, updateGoal, deleteGoal } = useAppStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDesc, setNewGoalDesc] = useState('');
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [activeAiMenu, setActiveAiMenu] = useState<{ type: string, index: number } | null>(null);
  const [aiResult, setAiResult] = useState<{ title: string, content: string } | null>(null);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveAiMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoalTitle.trim()) return;
    addGoal({
      title: newGoalTitle,
      description: newGoalDesc,
      status: 'Active',
    });
    setNewGoalTitle('');
    setNewGoalDesc('');
    setIsAdding(false);
  };

  const handleGenerateRoadmap = async (goal: Goal) => {
    setUiError(null);
    setIsGenerating(goal.id);
    try {
      const roadmap = await generateGoalRoadmap(goal.title, goal.description);
      updateGoal(goal.id, { roadmap });
    } catch (error) {
      console.error("Roadmap generation failed:", error);
      const detail = error instanceof Error ? error.message : "Failed to generate roadmap. Please try again.";
      setUiError(`Roadmap generation failed. ${detail}`);
    } finally {
      setIsGenerating(null);
    }
  };

  const handleRoadmapAiAction = async (action: string, itemText: string, context: string) => {
    setUiError(null);
    setActiveAiMenu(null);
    setIsPerformingAction(true);
    try {
      let prompt = '';
      
      switch (action) {
        case 'explain':
          prompt = `Explain the concept of "${itemText}" in the context of achieving the goal: "${context}". Keep it concise and actionable.`;
          break;
        case 'resources':
          prompt = `Suggest 3 specific, high-quality resources (books, courses, websites, or tools) to learn about "${itemText}" for the goal: "${context}".`;
          break;
        case 'expand':
          prompt = `Expand on the strategic idea: "${itemText}". How can this be implemented practically for the goal: "${context}"?`;
          break;
        case 'plan':
          prompt = `Draft a quick 3-step project plan to execute the idea: "${itemText}" for the goal: "${context}".`;
          break;
        case 'breakdown':
          prompt = `Break down the actionable step "${itemText}" into 3 smaller, manageable sub-tasks.`;
          break;
        case 'start':
          prompt = `What is the absolute first thing I should do right now to start working on: "${itemText}"?`;
          break;
      }

      const responseText = await askGemma(
        prompt,
        'You are the live goal-planning assistant for HumanBoard. Be concrete, practical, and avoid filler.'
      );

      setAiResult({
        title: `${action.charAt(0).toUpperCase() + action.slice(1)}: ${itemText}`,
        content: responseText || 'No response generated.',
      });
    } catch (error) {
      console.error("AI Action failed:", error);
      const detail = error instanceof Error ? error.message : "AI action failed.";
      setUiError(`Goal AI action failed. ${detail}`);
    } finally {
      setIsPerformingAction(false);
    }
  };

  const selectedGoal = goals.find(g => g.id === selectedGoalId);

  return (
    <div className="max-w-5xl mx-auto w-full p-8 flex flex-col h-full transition-colors duration-300">
      <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Goals</h1>
          <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Define your vision and let your configured AI map the path.</p>
        </div>
        <button 
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-5 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all text-sm font-semibold shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </header>

      {uiError && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 shadow-sm dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-500 dark:text-red-400 mb-2">Goal workflow error</div>
              <p className="leading-relaxed">{uiError}</p>
            </div>
            <button
              type="button"
              onClick={() => setUiError(null)}
              className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 dark:hover:text-red-200"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 flex-1 overflow-hidden">
        {/* Goals List */}
        <div className="md:col-span-1 space-y-4 overflow-y-auto pr-2 scrollbar-hide">
          <AnimatePresence>
            {isAdding && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-xl"
              >
                <form onSubmit={handleAddGoal} className="space-y-4">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Goal Title"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-2 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700"
                  />
                  <textarea
                    placeholder="Description (optional)"
                    value={newGoalDesc}
                    onChange={(e) => setNewGoalDesc(e.target.value)}
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-xl px-4 py-2 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 resize-none h-24"
                  />
                  <div className="flex justify-end gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsAdding(false)}
                      className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-xs font-bold uppercase tracking-widest"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          {goals.length === 0 && !isAdding && (
            <div className="text-center py-12 border-2 border-dashed border-stone-200 dark:border-stone-800 rounded-2xl text-stone-400 dark:text-stone-600">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No goals yet. Start by defining one.</p>
            </div>
          )}

          {goals.map(goal => (
            <button
              key={goal.id}
              onClick={() => setSelectedGoalId(goal.id)}
              className={cn(
                "w-full text-left p-5 rounded-2xl border transition-all group relative overflow-hidden",
                selectedGoalId === goal.id 
                  ? "bg-stone-900 dark:bg-stone-100 border-stone-900 dark:border-stone-100 shadow-lg" 
                  : "bg-white dark:bg-stone-900/40 border-stone-200 dark:border-stone-800 hover:border-stone-300 dark:hover:border-stone-700"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className={cn(
                  "font-semibold leading-tight",
                  selectedGoalId === goal.id ? "text-white dark:text-stone-900" : "text-stone-900 dark:text-stone-100"
                )}>
                  {goal.title}
                </h3>
                {goal.status === 'Completed' ? (
                  <CheckCircle2 className={cn("w-4 h-4", selectedGoalId === goal.id ? "text-white/60" : "text-green-500")} />
                ) : (
                  <Circle className={cn("w-4 h-4", selectedGoalId === goal.id ? "text-white/40" : "text-stone-300 dark:text-stone-700")} />
                )}
              </div>
              <p className={cn(
                "text-xs line-clamp-2 leading-relaxed",
                selectedGoalId === goal.id ? "text-white/70 dark:text-stone-900/70" : "text-stone-500 dark:text-stone-400"
              )}>
                {goal.description}
              </p>
              {goal.roadmap && (
                <div className={cn(
                  "mt-4 flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest",
                  selectedGoalId === goal.id ? "text-white/50 dark:text-stone-900/50" : "text-stone-400 dark:text-stone-600"
                )}>
                  <Sparkles className="w-3 h-3" />
                  Roadmap Ready
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Goal Detail & Roadmap */}
        <div className="md:col-span-2 bg-stone-50/50 dark:bg-stone-900/20 rounded-3xl border border-stone-100 dark:border-stone-800/50 p-8 overflow-y-auto scrollbar-hide">
          {selectedGoal ? (
            <div className="space-y-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border",
                      selectedGoal.status === 'Active' ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-100 dark:border-blue-900/30" : "bg-stone-100 dark:bg-stone-800 text-stone-500 border-stone-200 dark:border-stone-700"
                    )}>
                      {selectedGoal.status}
                    </span>
                    <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Created {new Date(selectedGoal.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-3xl font-bold text-stone-900 dark:text-stone-100 mb-4">{selectedGoal.title}</h2>
                  <p className="text-stone-600 dark:text-stone-400 leading-relaxed">{selectedGoal.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => deleteGoal(selectedGoal.id)}
                    className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {!selectedGoal.roadmap ? (
                <div className="py-16 flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-stone-100 dark:bg-stone-800 rounded-3xl flex items-center justify-center mb-6">
                    <Sparkles className="w-10 h-10 text-stone-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-2">Generate AI Roadmap</h3>
                  <p className="text-stone-500 dark:text-stone-400 max-w-md mb-8">Let AI analyze your goal and suggest the knowledge, ideas, and steps needed to achieve it.</p>
                  <button 
                    onClick={() => handleGenerateRoadmap(selectedGoal)}
                    disabled={isGenerating === selectedGoal.id}
                    className="flex items-center gap-3 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-8 py-3 rounded-2xl hover:scale-105 active:scale-95 transition-all text-sm font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    {isGenerating === selectedGoal.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {isGenerating === selectedGoal.id ? 'Generating Path...' : 'Generate Roadmap'}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-8">
                  {/* Knowledge */}
                  <section>
                    <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                      <BookOpen className="w-4 h-4 text-blue-500" />
                      Needed Knowledge
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedGoal.roadmap.knowledge.map((item, i) => (
                        <div key={i} className="group relative p-5 bg-white dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800/80 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-900/60 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all duration-300 shadow-sm hover:shadow-md overflow-visible">
                          <div className="absolute top-0 left-0 w-1 h-full bg-blue-400/0 group-hover:bg-blue-400/100 transition-colors rounded-l-2xl" />
                          <div className="flex items-start gap-4">
                            <div className="w-6 h-6 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                              <span className="text-[10px] font-bold">{i + 1}</span>
                            </div>
                            <span className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed font-medium group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">{item}</span>
                          </div>
                          
                          {/* AI Hover Action */}
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setActiveAiMenu({ type: 'knowledge', index: i })}
                              className="p-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-400 hover:text-blue-500 hover:border-blue-200 dark:hover:border-blue-800 shadow-sm transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            
                            {/* AI Menu Dropdown */}
                            <AnimatePresence>
                              {activeAiMenu?.type === 'knowledge' && activeAiMenu.index === i && (
                                <motion.div 
                                  ref={menuRef}
                                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl z-50 overflow-hidden"
                                >
                                  <div className="p-2 space-y-1">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('explain', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <AlignLeft className="w-3.5 h-3.5 text-stone-400" />
                                      Explain Concept
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('resources', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <BookOpen className="w-3.5 h-3.5 text-stone-400" />
                                      Find Resources
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Ideas */}
                  <section>
                    <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      Strategic Ideas
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedGoal.roadmap.ideas.map((item, i) => (
                        <div key={i} className="group relative p-5 bg-white dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800/80 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-900/60 hover:border-amber-200 dark:hover:border-amber-900/50 transition-all duration-300 shadow-sm hover:shadow-md overflow-visible">
                          <div className="absolute top-0 left-0 w-1 h-full bg-amber-400/0 group-hover:bg-amber-400/100 transition-colors rounded-l-2xl" />
                          <div className="flex items-start gap-4">
                            <div className="w-6 h-6 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-110 transition-transform">
                              <Sparkles className="w-3 h-3" />
                            </div>
                            <span className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed font-medium group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">{item}</span>
                          </div>

                          {/* AI Hover Action */}
                          <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => setActiveAiMenu({ type: 'ideas', index: i })}
                              className="p-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-400 hover:text-amber-500 hover:border-amber-200 dark:hover:border-amber-800 shadow-sm transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            
                            {/* AI Menu Dropdown */}
                            <AnimatePresence>
                              {activeAiMenu?.type === 'ideas' && activeAiMenu.index === i && (
                                <motion.div 
                                  ref={menuRef}
                                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl z-50 overflow-hidden"
                                >
                                  <div className="p-2 space-y-1">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('expand', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <Wand2 className="w-3.5 h-3.5 text-stone-400" />
                                      Expand Idea
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('plan', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <GitBranch className="w-3.5 h-3.5 text-stone-400" />
                                      Draft Project Plan
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Todos */}
                  <section>
                    <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                      <ListTodo className="w-4 h-4 text-emerald-500" />
                      Actionable Steps
                    </h3>
                    <div className="space-y-3">
                      {selectedGoal.roadmap.todos.map((item, i) => (
                        <div key={i} className="group relative p-4 bg-white dark:bg-stone-900/30 border border-stone-200 dark:border-stone-800/80 rounded-2xl hover:bg-stone-50 dark:hover:bg-stone-900/60 hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-all duration-300 shadow-sm hover:shadow-md flex items-center gap-4 cursor-pointer overflow-visible">
                          <button className="w-5 h-5 rounded-md border-2 border-stone-300 dark:border-stone-600 group-hover:border-emerald-500 dark:group-hover:border-emerald-400 transition-colors shrink-0 flex items-center justify-center text-transparent group-hover:text-emerald-500">
                            <CheckCircle2 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          <span className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed font-medium group-hover:text-stone-900 dark:group-hover:text-stone-100 transition-colors">{item}</span>

                          {/* AI Hover Action */}
                          <div className="absolute top-1/2 -translate-y-1/2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveAiMenu({ type: 'todos', index: i });
                              }}
                              className="p-1.5 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-stone-400 hover:text-emerald-500 hover:border-emerald-200 dark:hover:border-emerald-800 shadow-sm transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                            
                            {/* AI Menu Dropdown */}
                            <AnimatePresence>
                              {activeAiMenu?.type === 'todos' && activeAiMenu.index === i && (
                                <motion.div 
                                  ref={menuRef}
                                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-xl z-50 overflow-hidden"
                                >
                                  <div className="p-2 space-y-1">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('breakdown', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <GitBranch className="w-3.5 h-3.5 text-stone-400" />
                                      Break Down Steps
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleRoadmapAiAction('start', item, selectedGoal.title); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
                                    >
                                      <Lightbulb className="w-3.5 h-3.5 text-stone-400" />
                                      How to Start?
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className="pt-8 border-t border-stone-100 dark:border-stone-800">
                    <button 
                      onClick={() => handleGenerateRoadmap(selectedGoal)}
                      disabled={isGenerating === selectedGoal.id}
                      className="text-[10px] font-bold uppercase tracking-widest text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className={cn("w-3 h-3", isGenerating === selectedGoal.id && "animate-spin")} />
                      Regenerate Roadmap
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-stone-400 dark:text-stone-600">
              <Target className="w-16 h-16 mb-6 opacity-10" />
              <p className="text-lg font-medium">Select a goal to view your roadmap.</p>
            </div>
          )}
        </div>
      </div>

      {/* AI Action Loading Overlay */}
      <AnimatePresence>
        {isPerformingAction && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-stone-900/20 backdrop-blur-sm flex items-center justify-center"
          >
            <div className="bg-white dark:bg-stone-900 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              <span className="text-sm font-bold text-stone-700 dark:text-stone-300 uppercase tracking-widest">AI is thinking...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Result Modal */}
      <AnimatePresence>
        {aiResult && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setAiResult(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-stone-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-stone-200 dark:border-stone-800 flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-stone-100 dark:border-stone-800 flex items-start justify-between bg-stone-50/50 dark:bg-stone-950/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-500 flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 dark:text-stone-100">{aiResult.title}</h3>
                    <p className="text-[10px] uppercase tracking-widest text-stone-500 mt-0.5">AI Generated Insight</p>
                  </div>
                </div>
                <button 
                  onClick={() => setAiResult(null)}
                  className="p-2 text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-8 overflow-y-auto prose prose-stone dark:prose-invert max-w-none">
                <ReactMarkdown>{aiResult.content}</ReactMarkdown>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
