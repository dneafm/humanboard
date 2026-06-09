import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Inbox, Lightbulb, RefreshCw, FolderKanban, Search as SearchIcon, Network, Moon, Sun, Target, Radar, LogOut, HelpCircle, X, LayoutDashboard, Menu, ArrowRight, Check, MessageSquareText, ShieldCheck, Sparkles, Image, Bell, GitBranch, WandSparkles } from 'lucide-react';
import { cn } from './lib/utils';
import InboxPage from './pages/Inbox';
import IdeasPage from './pages/Ideas';
import IdeaDetailPage from './pages/IdeaDetail';
import ReviewPage from './pages/Review';
import ProjectsPage from './pages/Projects';
import SearchPage from './pages/Search';
import MapPage from './pages/Map';
import GoalsPage from './pages/Goals';
import IncubationPage from './pages/Incubation';
import CommandCenterPage from './pages/CommandCenter';
import { WorkflowPage } from './pages/Workflow';
import Chatbot from './components/Chatbot';
import { hydrateAppStoreFromRepository, useAppStore } from './store';
import { useEffect, useState } from 'react';
import MemoryConsolidator from './components/MemoryConsolidator';
import { useAuthStore } from './stores/authStore';
import { apiFetch } from './lib/apiClient';
import AiEraKbAutoBridge from './components/AiEraKbAutoBridge';
import NotificationCenter from './components/NotificationCenter';
import NotificationEngine from './components/NotificationEngine';
import { isFirebaseConfigured, missingFirebaseConfigKeys } from './config/firebase';

declare const __APP_VERSION__: string;
const enableAiEraKbBridge = import.meta.env.VITE_ENABLE_AI_ERA_KB_BRIDGE === 'true';

const tutorialSteps = [
  {
    title: 'Capture raw thoughts in Inbox',
    body: 'Drop ideas, links, questions, market signals, or rough notes into Inbox. Do not over-organize at capture time.',
  },
  {
    title: 'Compile useful notes into Ideas',
    body: 'Use Ideas for shaped knowledge: concepts, principles, base skills, opportunities, and decisions worth revisiting.',
  },
  {
    title: 'Watch long-horizon bets in Incubation',
    body: 'Incubation tracks capability bets and weak signals. Use it for things that are not ready yet but may become high leverage.',
  },
  {
    title: 'Review and connect the board',
    body: 'Review surfaces stale, orphaned, duplicate, or low-confidence items. Map shows relationships so the board becomes more than a note pile.',
  },
  {
    title: 'Use the assistant as an operator',
    body: 'Ask the assistant to turn messy input into board items, summarize signals, or save useful answers back into HumanBoard.',
  },
];

function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-stone-950/55 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-2xl">
        <div className="sticky top-0 bg-white/95 dark:bg-stone-950/95 backdrop-blur border-b border-stone-200 dark:border-stone-800 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">HumanBoard Guide</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">A quick path for using the board without turning it into a filing chore.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            aria-label="Close guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="grid gap-3">
            {tutorialSteps.map((step, index) => (
              <div key={step.title} className="rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/70 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-stone-900 text-xs font-semibold text-white dark:bg-stone-100 dark:text-stone-950">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{step.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{step.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Start with one useful note in Inbox, then review whether it should become an Idea, a Project, or a capability bet.
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Guide</span>
    </button>
  );
}

function UpdateButton() {
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const response = await apiFetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setHasUpdate(Boolean(payload?.updateAvailable));
        }
      } catch {
        // ignore transient update-check failures
      }
    };

    checkForUpdate();
    const interval = window.setInterval(checkForUpdate, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!hasUpdate) return null;

  return (
    <button
      onClick={() => window.location.reload()}
      className="flex items-center justify-center gap-2 px-3 py-2 w-full rounded-md text-sm font-medium bg-amber-500 text-stone-950 hover:bg-amber-400 transition-all"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Update available on GitHub</span>
    </button>
  );
}

function Sidebar({ onOpenTutorial }: { onOpenTutorial: () => void }) {
  const { isDarkMode, toggleDarkMode } = useAppStore();
  const { user, signOutUser } = useAuthStore();
  const navItems = [
    { to: '/command-center', icon: LayoutDashboard, label: 'Command Center' },
    { to: '/', icon: Inbox, label: 'Inbox' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/incubation', icon: Radar, label: 'Incubation' },
    { to: '/map', icon: Network, label: 'Map' },
    { to: '/review', icon: RefreshCw, label: 'Review' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/search', icon: SearchIcon, label: 'Search' },
    { to: '/workflow', icon: Network, label: 'Workflow' },
  ];

  return (
    <div className="hidden md:flex w-64 bg-stone-50 dark:bg-stone-950 border-r border-stone-200 dark:border-stone-800 flex-col h-screen sticky top-0 transition-colors duration-300">
      <div className="p-6">
        <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100 tracking-tight flex items-center gap-2">
          <div className="w-6 h-6 bg-stone-800 dark:bg-stone-100 rounded-sm flex items-center justify-center">
            <span className="text-stone-50 dark:text-stone-900 text-xs font-bold">H</span>
          </div>
          HumanBoard
        </h1>
      </div>
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                isActive 
                  ? "bg-stone-200/50 dark:bg-stone-900 text-stone-900 dark:text-stone-100 shadow-sm" 
                  : "text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-900 dark:hover:text-stone-100"
              )
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
        <UpdateButton />
        <NotificationCenter />
        <GuideButton onClick={onOpenTutorial} />
        <div className="px-3 py-2 rounded-md bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <div className="text-xs font-medium text-stone-700 dark:text-stone-200 truncate">{user?.displayName ?? 'Signed in'}</div>
          <div className="text-[11px] text-stone-500 dark:text-stone-500 truncate">{user?.email}</div>
        </div>
        <button
          onClick={() => void signOutUser()}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-900 dark:hover:text-stone-100 transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign out</span>
        </button>
        <button 
          onClick={toggleDarkMode}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-900/50 hover:text-stone-900 dark:hover:text-stone-100 transition-all"
        >
          {isDarkMode ? (
            <>
              <Sun className="w-4 h-4" />
              <span>Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span>Dark Mode</span>
            </>
          )}
        </button>
        <MemoryConsolidator />
      </div>
    </div>
  );
}

function AuthScreen() {
  const { isAuthReady, signInWithGoogle } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  const handleSignIn = async () => {
    try {
      setError(null);
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    }
  };

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#f4f3ef] text-stone-950 dark:bg-[#0b0d0c] dark:text-stone-100">
      <TutorialModal open={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-950 text-white dark:bg-stone-100 dark:text-stone-950">
            <span className="text-sm font-bold">H</span>
          </div>
          <span className="text-base font-semibold">HumanBoard</span>
        </div>
        <button
          type="button"
          onClick={() => setIsTutorialOpen(true)}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-white hover:text-stone-950 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
        >
          <HelpCircle className="h-4 w-4" />
          <span>How it works</span>
        </button>
      </header>

      <main className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 pb-16 pt-5 sm:px-8 lg:min-h-[calc(100dvh-73px)] lg:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.1fr)] lg:items-center lg:gap-14 lg:px-12 lg:pb-20 lg:pt-8">
        <section className="max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Personal thinking workspace
          </div>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.03] sm:text-6xl">
            Turn scattered thoughts into direction.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400 sm:text-lg">
            Capture what is on your mind, distill the useful parts, and connect them to the goals and projects that matter.
          </p>

          <div className="mt-8 border-y border-stone-300 py-5 dark:border-stone-800">
            <button
              onClick={() => void handleSignIn()}
              disabled={!isAuthReady}
              className="group flex w-full items-center justify-between rounded-md bg-stone-950 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:bg-stone-400 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-emerald-400"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-white text-sm font-bold text-stone-950">G</span>
                {isAuthReady ? 'Continue with Google' : 'Checking session...'}
              </span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-stone-500 dark:text-stone-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Your Google account identifies your private workspace. HumanBoard does not post to your account.</span>
            </div>
            {error && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-3 text-sm text-stone-700 dark:text-stone-300">
            {['Fast inbox capture', 'Selective AI distillation', 'Connected goals and ideas', 'Your own private board'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="HumanBoard preview" className="relative min-w-0">
          <div className="absolute -left-4 top-12 hidden h-24 w-1 bg-amber-400 lg:block" />
          <div className="overflow-hidden rounded-lg border border-stone-300 bg-white shadow-[0_22px_70px_rgba(28,25,23,0.12)] dark:border-stone-800 dark:bg-stone-950 dark:shadow-none">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </div>
              <div className="text-[11px] font-medium text-stone-400">humanboard / today</div>
              <div className="h-6 w-6 rounded-sm bg-stone-100 dark:bg-stone-900" />
            </div>

            <div className="grid min-h-[470px] grid-cols-[52px_1fr] sm:grid-cols-[150px_1fr]">
              <div className="border-r border-stone-200 bg-stone-50 px-2 py-4 dark:border-stone-800 dark:bg-stone-900/60 sm:px-3">
                <div className="mb-5 flex items-center gap-2 px-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-950 text-xs font-bold text-white dark:bg-stone-100 dark:text-stone-950">H</div>
                  <span className="hidden text-xs font-semibold sm:block">HumanBoard</span>
                </div>
                <div className="space-y-1">
                  {[
                    { icon: Inbox, label: 'Inbox', active: true },
                    { icon: Lightbulb, label: 'Ideas' },
                    { icon: Target, label: 'Goals' },
                    { icon: Network, label: 'Map' },
                  ].map((item) => (
                    <div key={item.label} className={cn('flex h-8 items-center gap-2 rounded-md px-2 text-xs', item.active ? 'bg-stone-200 font-semibold text-stone-950 dark:bg-stone-800 dark:text-stone-100' : 'text-stone-500')}>
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden sm:block">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-w-0 p-4 sm:p-6">
                <div className="flex items-end justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">Tuesday, June 9</div>
                    <h2 className="mt-1 text-xl font-semibold sm:text-2xl">Good evening.</h2>
                  </div>
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-200 dark:border-stone-800">
                    <SearchIcon className="h-3.5 w-3.5 text-stone-500" />
                  </div>
                </div>

                <div className="mt-5 rounded-md border border-stone-300 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
                  <div className="flex items-start gap-3">
                    <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div>
                      <div className="text-xs font-semibold">Capture a thought</div>
                      <p className="mt-1 text-xs leading-5 text-stone-500">What feels important enough to remember?</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-[10px] font-semibold uppercase text-stone-500">Recently distilled</div>
                    <div className="text-[10px] text-stone-400">3 signals</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
                      <div className="mb-4 flex h-7 w-7 items-center justify-center rounded-sm bg-amber-100 dark:bg-amber-950">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                      </div>
                      <p className="text-xs font-semibold leading-5">Distribution is part of the product, not a task after launch.</p>
                      <div className="mt-3 text-[10px] text-stone-400">Idea · 8 min ago</div>
                    </div>
                    <div className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
                      <div className="mb-4 flex h-7 w-7 items-center justify-center rounded-sm bg-emerald-100 dark:bg-emerald-950">
                        <Target className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                      </div>
                      <p className="text-xs font-semibold leading-5">Build one repeatable system that compounds each week.</p>
                      <div className="mt-3 text-[10px] text-stone-400">Goal · Today</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                  <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-950 dark:bg-stone-100">
                    <Sparkles className="h-3.5 w-3.5 text-white dark:text-stone-950" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold">Assistant found a connection</div>
                    <div className="mt-0.5 text-[10px] text-stone-400">Your goal and latest idea reinforce each other.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="border-y border-stone-300 bg-white dark:border-stone-800 dark:bg-stone-950">
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.75fr_1.25fr] lg:px-12 lg:py-24">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">One continuous loop</div>
            <h2 className="mt-3 max-w-md text-3xl font-semibold leading-tight sm:text-4xl">From loose capture to useful action.</h2>
            <p className="mt-5 max-w-md text-base leading-7 text-stone-600 dark:text-stone-400">
              HumanBoard keeps the early mess without letting it become a permanent pile. Every part of the system helps useful thoughts mature.
            </p>
          </div>
          <div className="divide-y divide-stone-200 border-y border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {[
              ['01', 'Capture without friction', 'Paste text, links, and images into Inbox before the thought disappears.'],
              ['02', 'Distill what matters', 'Let the assistant selectively turn durable meaning into clean notes and developed ideas.'],
              ['03', 'Connect the knowledge', 'Link ideas to goals, projects, capability bets, and related context across the board.'],
              ['04', 'Resurface at the right time', 'Receive quiet, evidence-backed prompts when an old thought becomes relevant again.'],
            ].map(([number, title, body]) => (
              <div key={number} className="grid gap-2 py-5 sm:grid-cols-[48px_0.8fr_1.2fr] sm:items-start sm:gap-5">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{number}</div>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-6 text-stone-500 dark:text-stone-400">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="mb-14 max-w-2xl">
          <div className="text-xs font-semibold uppercase text-stone-500">Flagship functions</div>
          <h2 className="mt-3 text-3xl font-semibold leading-tight sm:text-4xl">A second workspace for the thoughts your first brain drops.</h2>
        </div>

        <div className="space-y-20 lg:space-y-28">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-950">
                <Image className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="mt-6 text-xs font-semibold uppercase text-emerald-700 dark:text-emerald-400">Loose capture inbox</div>
              <h3 className="mt-3 text-3xl font-semibold leading-tight">Capture the thought before organizing it.</h3>
              <p className="mt-5 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400">
                Inbox accepts unfinished thoughts, pasted images, links, and quick observations. Add context when you have it; keep moving when you do not.
              </p>
              <div className="mt-6 space-y-3 text-sm text-stone-700 dark:text-stone-300">
                {['Paste images directly from the clipboard', 'Keep raw notes separate from developed ideas', 'Review and compile when attention is available'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-y border-stone-300 py-5 dark:border-stone-800">
              <div className="rounded-lg border border-stone-300 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold">New inbox note</div>
                  <div className="text-[10px] text-stone-400">Now</div>
                </div>
                <div className="mt-4 grid grid-cols-[76px_1fr] gap-4">
                  <div className="aspect-square rounded-md border border-stone-200 bg-stone-100 p-2 dark:border-stone-800 dark:bg-stone-900">
                    <div className="h-full rounded-sm border border-dashed border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-950" />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-6">A product should help people notice their own patterns, not create more noise.</p>
                    <div className="mt-4 flex gap-2">
                      <span className="rounded-sm bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">raw thought</span>
                      <span className="rounded-sm bg-stone-100 px-2 py-1 text-[10px] font-medium text-stone-500 dark:bg-stone-900">image context</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 px-2 text-xs text-stone-500">
                <MessageSquareText className="h-4 w-4" />
                Add text later, then press Enter to capture.
              </div>
            </div>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 lg:order-1">
              <div className="rounded-lg border border-stone-300 bg-white dark:border-stone-800 dark:bg-stone-950">
                <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                  <div className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="h-4 w-4 text-emerald-600" /> HumanBoard Assistant</div>
                  <div className="flex items-center gap-2 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                    <div className="h-3.5 w-6 rounded-full bg-emerald-500 p-0.5"><div className="ml-auto h-2.5 w-2.5 rounded-full bg-white" /></div>
                    Auto-distill on
                  </div>
                </div>
                <div className="space-y-4 p-4">
                  <div className="ml-auto max-w-[80%] rounded-md bg-stone-950 px-3 py-2 text-xs leading-5 text-white dark:bg-stone-100 dark:text-stone-950">
                    I keep returning to products that become more valuable as they learn my context.
                  </div>
                  <div className="max-w-[88%] rounded-md bg-stone-100 px-3 py-3 text-xs leading-5 dark:bg-stone-900">
                    That suggests a durable product principle: <strong>context compounding creates switching value</strong>. I saved the principle and linked it to your HumanBoard positioning goal.
                  </div>
                  <div className="flex items-center gap-2 border-t border-stone-200 pt-3 text-[10px] text-stone-500 dark:border-stone-800">
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    Saved one distilled idea, not the raw conversation
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-950">
                <WandSparkles className="h-5 w-5 text-amber-700 dark:text-amber-400" />
              </div>
              <div className="mt-6 text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">Selective Auto-distill</div>
              <h3 className="mt-3 text-3xl font-semibold leading-tight">Keep the meaning, not the transcript.</h3>
              <p className="mt-5 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400">
                The assistant can identify durable information during conversation and save at most one cleaned note or developed idea. Temporary details, generic advice, and raw chat stay out.
              </p>
            </div>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-sky-100 dark:bg-sky-950">
                <GitBranch className="h-5 w-5 text-sky-700 dark:text-sky-400" />
              </div>
              <div className="mt-6 text-xs font-semibold uppercase text-sky-700 dark:text-sky-400">Goals and knowledge map</div>
              <h3 className="mt-3 text-3xl font-semibold leading-tight">Turn ideas into a roadmap you can edit.</h3>
              <p className="mt-5 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400">
                Ask the assistant to create a goal, develop its strategic ideas, identify needed knowledge, and break the path into actionable steps. Then edit or regenerate any panel as your understanding changes.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Needed knowledge', 'Understand retention loops and context compounding.', Lightbulb, 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'],
                ['Strategic idea', 'Make accumulated context visibly improve each interaction.', Sparkles, 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400'],
                ['Actionable step', 'Interview five users about moments they rediscovered old notes.', Check, 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'],
                ['Connected signal', 'Users value resurfacing when it arrives with evidence.', Network, 'bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300'],
              ].map(([label, body, Icon, color]) => (
                <div key={String(label)} className="rounded-md border border-stone-300 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                  <div className={cn('flex h-8 w-8 items-center justify-center rounded-sm', String(color))}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="mt-5 text-[10px] font-semibold uppercase text-stone-500">{String(label)}</div>
                  <p className="mt-2 text-sm font-medium leading-6">{String(body)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="order-2 border-y border-stone-300 py-4 dark:border-stone-800 lg:order-1">
              <div className="space-y-3">
                <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-400">Pattern detected · 86%</div>
                    <Bell className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                  </div>
                  <h4 className="mt-3 text-sm font-semibold">Your strongest product ideas share one theme.</h4>
                  <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-400">Three recent ideas emphasize reducing cognitive overhead. This may be the clearest positioning thread for HumanBoard.</p>
                </div>
                <div className="rounded-md border border-stone-300 bg-white p-4 dark:border-stone-800 dark:bg-stone-950">
                  <div className="text-[10px] font-semibold uppercase text-stone-500">Relevant memory</div>
                  <p className="mt-2 text-sm font-medium">You wrote about “quiet software” 47 days ago. It directly supports this decision.</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-950">
                <Bell className="h-5 w-5 text-violet-700 dark:text-violet-400" />
              </div>
              <div className="mt-6 text-xs font-semibold uppercase text-violet-700 dark:text-violet-400">Second-subconscious insights</div>
              <h3 className="mt-3 text-3xl font-semibold leading-tight">Let old knowledge return with a reason.</h3>
              <p className="mt-5 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400">
                HumanBoard stays quiet until it finds enough evidence for a useful intervention: a repeated pattern, a relevant old note, or an unfinished loop worth revisiting.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-stone-300 bg-stone-950 text-white dark:border-stone-800">
        <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:px-12 lg:py-20">
          <div>
            <div className="text-xs font-semibold uppercase text-emerald-400">Build a board that learns with you</div>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">Start with one thought worth keeping.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-stone-400">Your Google account opens a private HumanBoard workspace and keeps each tester's synced data isolated.</p>
          </div>
          <button
            onClick={() => void handleSignIn()}
            disabled={!isAuthReady}
            className="group flex min-w-64 items-center justify-between rounded-md bg-white px-4 py-3.5 text-sm font-semibold text-stone-950 transition-colors hover:bg-emerald-400 disabled:cursor-wait disabled:bg-stone-600 disabled:text-stone-300"
          >
            <span>{isAuthReady ? 'Continue with Google' : 'Checking session...'}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </section>
    </div>
  );
}

function FirebaseConfigScreen() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex items-center justify-center px-4">
      <div className="w-full max-w-lg border border-amber-200 dark:border-amber-900 bg-white dark:bg-stone-900 rounded-lg p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-amber-500 rounded-sm flex items-center justify-center">
            <span className="text-stone-950 text-sm font-bold">!</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Firebase config missing</h1>
            <p className="text-sm text-stone-500 dark:text-stone-400">Google login cannot start until the Vite env values are set.</p>
          </div>
        </div>
        <div className="rounded-md bg-stone-100 dark:bg-stone-950 p-3 text-sm font-mono text-stone-700 dark:text-stone-300">
          {missingFirebaseConfigKeys.map((key) => (
            <div key={key}>VITE_FIREBASE_{key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}</div>
          ))}
        </div>
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">
          Update <span className="font-mono">.env.local</span>, run <span className="font-mono">npm run build:prod</span>, then restart PM2.
        </p>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex items-center justify-center px-4">
      <div className="text-sm text-stone-500 dark:text-stone-400">Loading your board...</div>
    </div>
  );
}

function MobileMenu({
  open,
  onClose,
  navItems,
  onOpenTutorial,
}: {
  open: boolean;
  onClose: () => void;
  navItems: Array<{ to: string; icon: typeof Inbox; label: string }>;
  onOpenTutorial: () => void;
}) {
  const { user, signOutUser } = useAuthStore();
  const { isDarkMode, toggleDarkMode } = useAppStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] md:hidden">
      <button
        type="button"
        aria-label="Close menu overlay"
        className="absolute inset-0 bg-stone-950/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute right-0 top-0 h-full w-[85vw] max-w-xs border-l border-stone-200 bg-white p-4 shadow-2xl dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">HumanBoard</div>
            <div className="text-xs text-stone-500 dark:text-stone-400">Navigation</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-xs font-medium text-stone-700 dark:text-stone-200 truncate">{user?.displayName ?? 'Signed in'}</div>
          <div className="text-[11px] text-stone-500 dark:text-stone-500 truncate">{user?.email}</div>
        </div>

        <div className="space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                    : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-900'
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
          <UpdateButton />
          <NotificationCenter />
          <GuideButton
            onClick={() => {
              onClose();
              onOpenTutorial();
            }}
          />
          <button
            type="button"
            onClick={() => {
              toggleDarkMode();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-all hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void signOutUser();
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-stone-600 transition-all hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const isDarkMode = useAppStore(state => state.isDarkMode);
  const { isAuthReady, userId } = useAuthStore();
  const isLocalCommandCenter = window.location.port === '3010';
  const [hasHydratedUserSnapshot, setHasHydratedUserSnapshot] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navItems = [
    { to: '/command-center', icon: LayoutDashboard, label: 'Command Center' },
    { to: '/', icon: Inbox, label: 'Inbox' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/incubation', icon: Radar, label: 'Incubation' },
    { to: '/map', icon: Network, label: 'Map' },
    { to: '/review', icon: RefreshCw, label: 'Review' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/search', icon: SearchIcon, label: 'Search' },
  ];

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (!isAuthReady || !userId) {
      setHasHydratedUserSnapshot(false);
      return;
    }

    let cancelled = false;
    setHasHydratedUserSnapshot(false);
    void hydrateAppStoreFromRepository().finally(() => {
      if (!cancelled) setHasHydratedUserSnapshot(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, userId]);

  if (isLocalCommandCenter && isAuthReady && !userId) {
    return (
      <BrowserRouter>
        <CommandCenterPage />
      </BrowserRouter>
    );
  }

  if (!isAuthReady || !userId) {
    if (!isFirebaseConfigured) {
      return <FirebaseConfigScreen />;
    }

    return <AuthScreen />;
  }

  if (!hasHydratedUserSnapshot) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      {enableAiEraKbBridge && <AiEraKbAutoBridge />}
      <NotificationEngine />
      <TutorialModal open={isTutorialOpen} onClose={() => setIsTutorialOpen(false)} />
      <MobileMenu
        open={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navItems={navItems}
        onOpenTutorial={() => setIsTutorialOpen(true)}
      />
      <div className="flex min-h-screen bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans selection:bg-stone-200 dark:selection:bg-stone-800 transition-colors duration-300">
        <Sidebar onOpenTutorial={() => setIsTutorialOpen(true)} />
        <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          <div className="sticky top-0 z-40 md:hidden border-b border-stone-200/80 dark:border-stone-800/80 bg-stone-50/95 dark:bg-stone-950/95 backdrop-blur px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">HumanBoard</div>
                <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">Knowledge workspace</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="shrink-0">
                  <NotificationCenter />
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <Routes>
            <Route path="/command-center" element={<CommandCenterPage />} />
            <Route path="/" element={<InboxPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/ideas/:id" element={<IdeaDetailPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/incubation" element={<IncubationPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/workflow" element={<WorkflowPage />} />
          </Routes>
        </main>
        <Chatbot />
      </div>
    </BrowserRouter>
  );
}
