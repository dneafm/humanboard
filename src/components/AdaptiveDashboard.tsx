import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Project, type Goal, type Idea, type CapabilityBet, getReadinessScore } from '../store';
import { useNotificationStore } from '../stores/notificationStore';
import { runNotificationEngine } from './NotificationEngine';
import { 
  Sparkles, 
  ChevronLeft, 
  ChevronRight, 
  Target, 
  Compass, 
  Activity, 
  Eye, 
  MessageSquare, 
  Plus, 
  ArrowRight,
  AlertTriangle,
  History,
  RefreshCw,
  X,
  Bell
} from 'lucide-react';

interface AdaptiveDashboardProps {
  projects: Project[];
  goals: Goal[];
  ideas: Idea[];
  capabilityBets: CapabilityBet[];
  onSelectPrompt: (prefill: string, modeId: string | null) => void;
}

interface SuggestivePrompt {
  id: string;
  text: string;
  category: string;
  prefill: string;
  mode: string | null;
}

export default function AdaptiveDashboard({
  projects,
  goals,
  ideas,
  capabilityBets,
  onSelectPrompt
}: AdaptiveDashboardProps) {
  const navigate = useNavigate();
  const { notifications, dismiss, markRead } = useNotificationStore();

  const activeInsights = useMemo(() => {
    return notifications.filter(
      (item) => item.deliveryState !== 'dismissed' && item.deliveryState !== 'expired'
    );
  }, [notifications]);

  const activeProjects = useMemo(() => projects.filter(p => p.status === 'Active'), [projects]);
  const activeGoals = useMemo(() => goals.filter(g => g.status === 'Active'), [goals]);
  const incubatingIdeas = useMemo(() => 
    ideas.filter(idea => idea.type === 'Concept' && (idea.stage === 'Seed' || idea.stage === 'Sprouting')), 
    [ideas]
  );
  const activeBets = useMemo(() => capabilityBets.filter(bet => !bet.archivedAt), [capabilityBets]);

  // Generate dynamic prompts based on store state
  const prompts = useMemo((): SuggestivePrompt[] => {
    const list: SuggestivePrompt[] = [];

    activeProjects.forEach(p => {
      list.push({
        id: `project-${p.id}`,
        category: 'Active Project',
        text: `What was the main outcome, win, or blocker on project '${p.title}' today?`,
        prefill: `Regarding project [${p.title}]: `,
        mode: 'context'
      });
    });

    activeGoals.forEach(g => {
      list.push({
        id: `goal-${g.id}`,
        category: 'Active Goal',
        text: `What progress did you make toward your goal '${g.title}' today?`,
        prefill: `Regarding goal [${g.title}]: `,
        mode: 'context'
      });
    });

    incubatingIdeas.slice(0, 3).forEach(idea => {
      list.push({
        id: `dream-${idea.id}`,
        category: 'Incubating Dream',
        text: `Any new exposure, signal, or pull for the dream '${idea.title}'?`,
        prefill: `Regarding dream [${idea.title}]: `,
        mode: 'context'
      });
    });

    activeBets.slice(0, 3).forEach(bet => {
      list.push({
        id: `bet-${bet.id}`,
        category: 'Capability Bet',
        text: `Any fresh evidence matching or complicating the thesis: '${bet.title}'?`,
        prefill: `Regarding capability bet [${bet.title}]: `,
        mode: 'context'
      });
    });

    // Default general reflection prompts
    list.push({
      id: 'general-1',
      category: 'General Reflection',
      text: 'What kept returning to your mind or orbiting in the background today?',
      prefill: 'Orbiting my mind today: ',
      mode: 'obsession'
    });
    list.push({
      id: 'general-2',
      category: 'General Reflection',
      text: 'What task, decision, or topic have you actively avoided thinking about today?',
      prefill: 'Avoided topic/decision: ',
      mode: 'avoidance'
    });
    list.push({
      id: 'general-3',
      category: 'General Reflection',
      text: 'What is something you want right now, but feel hesitant or conflicted to pursue?',
      prefill: 'Desire/Conflict: ',
      mode: 'contradiction'
    });
    list.push({
      id: 'general-4',
      category: 'General Reflection',
      text: 'What is currently drawing your attention or curiosity, even if you cannot explain why yet?',
      prefill: 'Curiosity/Pull: ',
      mode: 'obsession'
    });
    list.push({
      id: 'general-5',
      category: 'General Reflection',
      text: 'What is the biggest active tension or blocker you are facing right now?',
      prefill: 'Current tension: ',
      mode: 'avoidance'
    });

    return list;
  }, [activeProjects, activeGoals, incubatingIdeas, activeBets]);

  const [promptIndex, setPromptIndex] = useState(0);

  const handleNextPrompt = () => {
    setPromptIndex(prev => (prev + 1) % prompts.length);
  };

  const handlePrevPrompt = () => {
    setPromptIndex(prev => (prev - 1 + prompts.length) % prompts.length);
  };

  const currentPrompt = prompts[promptIndex];

  return (
    <div className="space-y-10 animate-fade-in">
      {/* Suggestive Prompt Carousel */}
      {prompts.length > 0 && currentPrompt && (
        <div className="relative overflow-hidden rounded-3xl border border-stone-200/80 bg-stone-50/70 p-8 shadow-sm transition-all hover:shadow-md dark:border-stone-800/80 dark:bg-stone-900/30 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-stone-500 dark:text-stone-400">
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em]">{currentPrompt.category}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={handlePrevPrompt} 
                className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-400 transition-colors"
                title="Previous prompt"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-stone-400 dark:text-stone-600 px-1 font-mono">{promptIndex + 1}/{prompts.length}</span>
              <button 
                onClick={handleNextPrompt} 
                className="p-1.5 rounded-lg border border-stone-200 bg-white hover:bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-400 transition-colors"
                title="Next prompt"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          <button 
            onClick={() => onSelectPrompt(currentPrompt.prefill, currentPrompt.mode)}
            className="w-full text-left group"
          >
            <p className="text-xl md:text-2xl font-medium tracking-tight text-stone-900 dark:text-stone-100 group-hover:text-stone-700 dark:group-hover:text-stone-300 transition-colors leading-snug">
              "{currentPrompt.text}"
            </p>
            <div className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-stone-500 group-hover:text-stone-900 dark:text-stone-500 dark:group-hover:text-stone-300 transition-colors">
              <span>Jot a reflection note</span>
              <ArrowRight className="h-3 w-3 transform group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      )}

      {/* Active Subconscious Insights */}
      {activeInsights.length > 0 && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <Bell className="h-4 w-4 animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-100">Subconscious Insights</h3>
                <p className="text-[10px] text-stone-400 dark:text-stone-600 uppercase tracking-widest font-medium">Insight Engine MVP Matches</p>
              </div>
            </div>
            <button
              onClick={runNotificationEngine}
              className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-50 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-400 transition-colors"
              title="Run insight engine"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {activeInsights.map((insight) => {
              let typeLabel = insight.type.replaceAll('_', ' ');
              let typeColor = 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-400';
              let Icon = Bell;

              if (insight.type === 'daily_synthesis') {
                typeColor = 'bg-emerald-50 text-emerald-700 border border-emerald-200/50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30';
                Icon = Sparkles;
              } else if (insight.type === 'contradiction_detected') {
                typeColor = 'bg-red-50 text-red-700 border border-red-200/50 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/30';
                Icon = AlertTriangle;
              } else if (insight.type === 'memory_resurfaced') {
                typeColor = 'bg-indigo-50 text-indigo-700 border border-indigo-200/50 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/30';
                Icon = History;
              } else if (insight.type === 'unfinished_loop') {
                typeColor = 'bg-amber-50 text-amber-700 border border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/30';
                Icon = Target;
              }

              return (
                <div 
                  key={insight.id} 
                  className="relative group p-5 rounded-2xl border border-stone-200/80 bg-white shadow-sm hover:shadow-md dark:border-stone-800/80 dark:bg-stone-900/10 transition-all flex flex-col justify-between"
                >
                  <button 
                    onClick={() => dismiss(insight.id)}
                    className="absolute top-4 right-4 p-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Dismiss insight"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`p-1.5 rounded-lg ${typeColor.split(' ')[0]} ${typeColor.split(' ')[1]}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${typeColor}`}>
                        {typeLabel}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-50 leading-snug">{insight.title}</h4>
                    <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 line-clamp-2">{insight.body}</p>
                    {insight.insight && (
                      <div className="mt-2.5 p-2 bg-stone-50 dark:bg-stone-900/40 rounded-lg border border-stone-100 dark:border-stone-800/40">
                        <p className="text-[11px] italic leading-relaxed text-stone-600 dark:text-stone-400">
                          {insight.insight}
                        </p>
                      </div>
                    )}
                  </div>

                  {insight.action && (
                    <div className="mt-4 pt-3 border-t border-stone-200/40 dark:border-stone-800/40 flex justify-end">
                      <button
                        onClick={() => {
                          markRead(insight.id);
                          if (insight.action?.deepLink) {
                            navigate(insight.action.deepLink);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                      >
                        <span>{insight.action.label}</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid of State Distiller Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Active Focus Card */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/10 flex flex-col min-h-[300px]">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">Active Focus</h3>
              <p className="text-[10px] text-stone-400 dark:text-stone-600 uppercase tracking-widest font-medium">Projects & Goals</p>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {activeProjects.length === 0 && activeGoals.length === 0 ? (
              <div className="h-full flex items-center justify-center py-10 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-600 italic">No active projects or goals right now.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {activeProjects.map(project => (
                  <div key={project.id} className="group flex items-start justify-between gap-3 p-3 rounded-2xl border border-stone-100 bg-stone-50/50 hover:bg-stone-50 dark:border-stone-800/50 dark:bg-stone-900/20 dark:hover:bg-stone-900/40 transition-colors">
                    <div className="min-w-0">
                       <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3 text-blue-500" />
                        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Project</span>
                      </div>
                      <h4 className="text-sm font-medium text-stone-950 dark:text-stone-50 truncate mt-1">{project.title}</h4>
                      <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">{project.description}</p>
                    </div>
                    <button 
                      onClick={() => onSelectPrompt(`Regarding project [${project.title}]: `, 'context')}
                      className="shrink-0 p-2 text-stone-400 hover:text-stone-950 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
                      title="Reflect on project"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                
                {activeGoals.map(goal => (
                  <div key={goal.id} className="group flex items-start justify-between gap-3 p-3 rounded-2xl border border-stone-100 bg-stone-50/50 hover:bg-stone-50 dark:border-stone-800/50 dark:bg-stone-900/20 dark:hover:bg-stone-900/40 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Target className="h-3 w-3 text-emerald-500" />
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Goal</span>
                      </div>
                      <h4 className="text-sm font-medium text-stone-950 dark:text-stone-50 truncate mt-1">{goal.title}</h4>
                      <p className="text-xs text-stone-500 dark:text-stone-400 line-clamp-1 mt-0.5">{goal.description}</p>
                    </div>
                    <button 
                      onClick={() => onSelectPrompt(`Regarding goal [${goal.title}]: `, 'context')}
                      className="shrink-0 p-2 text-stone-400 hover:text-stone-950 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
                      title="Reflect on goal"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Incubation Watch Card */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/10 flex flex-col min-h-[300px]">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-400 rounded-xl">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">Incubation Watch</h3>
              <p className="text-[10px] text-stone-400 dark:text-stone-600 uppercase tracking-widest font-medium">Warming Dreams & Ideas</p>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {incubatingIdeas.length === 0 ? (
              <div className="h-full flex items-center justify-center py-10 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-600 italic">No incubating dreams right now.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                {incubatingIdeas.slice(0, 4).map(idea => {
                  const score = idea.activationReadiness ? getReadinessScore(idea.activationReadiness) : 25;
                  return (
                    <div key={idea.id} className="group flex items-start justify-between gap-3 p-3 rounded-2xl border border-stone-100 bg-stone-50/50 hover:bg-stone-50 dark:border-stone-800/50 dark:bg-stone-900/20 dark:hover:bg-stone-900/40 transition-colors">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-medium text-stone-950 dark:text-stone-50 truncate">{idea.title}</h4>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 bg-stone-200 dark:bg-stone-800 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${score >= 65 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-stone-400'}`} 
                              style={{ width: `${score}%` }} 
                            />
                          </div>
                          <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400">{score}% readiness</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => onSelectPrompt(`Regarding dream [${idea.title}]: `, 'context')}
                        className="shrink-0 p-2 text-stone-400 hover:text-stone-950 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
                        title="Add signal to dream"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Capability Signal Card */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-6 shadow-sm dark:border-stone-800/80 dark:bg-stone-900/10 flex flex-col min-h-[300px] md:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">Capability Bets</h3>
              <p className="text-[10px] text-stone-400 dark:text-stone-600 uppercase tracking-widest font-medium">Conviction Bets & Evidence Signals</p>
            </div>
          </div>

          <div className="space-y-4 flex-1">
            {activeBets.length === 0 ? (
              <div className="h-full flex items-center justify-center py-10 text-center">
                <p className="text-sm text-stone-400 dark:text-stone-600 italic">No active capability bets defined yet.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeBets.slice(0, 4).map(bet => (
                  <div key={bet.id} className="group p-4 rounded-2xl border border-stone-100 bg-stone-50/50 hover:bg-stone-50 dark:border-stone-800/50 dark:bg-stone-900/20 dark:hover:bg-stone-900/40 transition-colors flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-50 truncate">{bet.title}</h4>
                        <span className="text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/55 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full">
                          {bet.conviction} / {bet.thresholdToCommit}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 line-clamp-2 leading-relaxed">{bet.thesis}</p>
                      
                      {bet.keywords.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {bet.keywords.slice(0, 4).map(kw => (
                            <span key={kw} className="text-[9px] font-bold text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-2 py-0.5 rounded-md uppercase tracking-wider">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-stone-200/50 dark:border-stone-800/50 flex items-center justify-between">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-600">Status: {bet.status}</span>
                      <button 
                        onClick={() => onSelectPrompt(`Regarding capability bet [${bet.title}]: `, 'context')}
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-600 group-hover:text-stone-950 dark:text-stone-400 dark:group-hover:text-stone-150 transition-colors"
                      >
                        <span>Log Signal</span>
                        <ArrowRight className="h-3 w-3 transform group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
