import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Inbox, Lightbulb, RefreshCw, FolderKanban, Search as SearchIcon, Network, Moon, Sun, Target, Radar, LogOut, HelpCircle, X, LayoutDashboard, Menu, ArrowRight, Check, MessageSquareText, ShieldCheck, Sparkles, Image, Bell, GitBranch, WandSparkles, ChevronDown, Settings as SettingsIcon, FileText, BookOpen, Users, Compass, Globe, Layers } from 'lucide-react';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import productDocs from '../docs/product-knowledge.md?raw';
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
import FusionPage from './pages/Fusion';
import FusionDetailPage from './pages/FusionDetail';
import PublicFusionPage from './pages/PublicFusion';
import PublicFusionIndexPage from './pages/PublicFusionIndex';
import PublicAuthorPage from './pages/PublicAuthor';
import PublicNotesPage from './pages/PublicNotes';
import PublicNoteDetailPage from './pages/PublicNoteDetail';
import PublicDiscoverPage from './pages/PublicDiscover';
import SubscribersPage from './pages/Subscribers';
import { ComposeNoteModal } from './components/ComposeNoteModal';
import Chatbot from './components/Chatbot';
import { hydrateAppStoreFromRepository, useAppStore } from './store';
import { useEffect, useLayoutEffect, useState } from 'react';
import MemoryConsolidator from './components/MemoryConsolidator';
import { useAuthStore } from './stores/authStore';
import { subscribeSaveResults } from './lib/storage/localSnapshotRepository';
import { DebugPanel } from './components/DebugPanel';
import { apiFetch } from './lib/apiClient';
import AiEraKbAutoBridge from './components/AiEraKbAutoBridge';
import NotificationCenter from './components/NotificationCenter';
import NotificationEngine from './components/NotificationEngine';
import { AUTO_DISTILL_LEVELS, getStoredAutoDistillLevel, setStoredAutoDistillLevel, type AutoDistillLevel } from './lib/autoDistill';
import { isFirebaseConfigured, missingFirebaseConfigKeys } from './config/firebase';

declare const __APP_VERSION__: string;
const enableAiEraKbBridge = import.meta.env.VITE_ENABLE_AI_ERA_KB_BRIDGE === 'true';
const ONBOARDING_SEEN_STORAGE_KEY = 'humanboard:onboarding-seen';
const onboardingAutoOpenedKey = (userId: string) => `humanboard:onboarding-auto-opened:${userId}`;

const uiTourSteps = [
  {
    target: 'tour-sidebar-inbox',
    title: 'Start in Inbox',
    body: 'Capture raw thoughts, links, screenshots, and fragments here before they disappear.',
  },
  {
    target: 'tour-inbox-capture',
    title: 'Use the real capture area',
    body: 'This is the live input area where new thoughts enter HumanBoard.',
  },
  {
    target: 'tour-sidebar-ideas',
    title: 'Promote useful notes into Ideas',
    body: 'Ideas hold cleaner concepts, principles, decisions, and reusable knowledge.',
  },
  {
    target: 'tour-sidebar-goals',
    title: 'Connect work to Goals',
    body: 'Goals turn interesting thoughts into active direction and execution.',
  },
  {
    target: 'tour-sidebar-incubation',
    title: 'Keep long bets in Incubation',
    body: 'Use Incubation for weak signals and higher-latency opportunities that are not ready yet.',
  },
  {
    target: 'tour-sidebar-review',
    title: 'Review what needs attention',
    body: 'Review helps surface stale threads, contradictions, and items worth revisiting.',
  },
  {
    target: 'tour-sidebar-projects',
    title: 'Track active builds in Projects',
    body: 'Projects separate active execution from incubation so live work stays visible and concrete.',
  },
  {
    target: 'tour-chatbot-button',
    title: 'Use the Chatbot when you want help thinking',
    body: 'Open Chatbot to unpack a raw thought, resolve contradictions, and turn fragments into stronger ideas.',
  },
  {
    target: 'tour-guide-button',
    title: 'Reopen this guide anytime',
    body: 'Use Guide whenever you want the walkthrough again.',
  },
] as const;

type UiTourStep = typeof uiTourSteps[number];

function SpotlightTour({
  open,
  stepIndex,
  onPrev,
  onNext,
  onClose,
}: {
  open: boolean;
  stepIndex: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = uiTourSteps[stepIndex];

  useLayoutEffect(() => {
    if (!open) return;

    const updateRect = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!element) {
        setRect(null);
        return;
      }
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      window.setTimeout(() => {
        setRect(element.getBoundingClientRect());
      }, 120);
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [open, step.target]);

  if (!open || !step) return null;

  const padding = 10;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 844;
  const isMobileViewport = viewportWidth < 640;
  const top = rect ? Math.max(rect.top - padding, 0) : 0;
  const left = rect ? Math.max(rect.left - padding, 0) : 0;
  const width = rect ? rect.width + padding * 2 : 0;
  const height = rect ? rect.height + padding * 2 : 0;
  const cardWidth = Math.min(isMobileViewport ? viewportWidth - 24 : 360, viewportWidth - 32);
  const cardTop = rect
    ? isMobileViewport
      ? Math.min(viewportHeight - 220, Math.max(16, top + height + 12))
      : Math.min(top + height + 16, viewportHeight - 220)
    : viewportHeight / 2 - 100;
  const cardLeft = rect
    ? isMobileViewport
      ? Math.max((viewportWidth - cardWidth) / 2, 12)
      : Math.min(Math.max(left, 16), viewportWidth - cardWidth - 16)
    : 16;

  return (
    <div className="pointer-events-none fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-stone-950/72" />
      {rect && (
        <>
          <div
            className="absolute rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(12,10,9,0.72),0_0_0_6px_rgba(255,255,255,0.14)] transition-all duration-200"
            style={{ top, left, width, height }}
          />
          <div
            className="absolute rounded-xl bg-white/8 ring-1 ring-white/20 transition-all duration-200"
            style={{ top, left, width, height }}
          />
        </>
      )}
      <div
        className="pointer-events-auto absolute rounded-xl border border-stone-700 bg-stone-950/96 p-4 text-stone-100 shadow-2xl"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-400">Interactive guide</div>
            <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100"
            aria-label="Close onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-stone-300">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          {uiTourSteps.map((_, index) => (
            <div key={index} className={cn('h-1.5 flex-1 rounded-full', index === stepIndex ? 'bg-white' : 'bg-stone-700')} />
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-stone-400 sm:order-2">{stepIndex + 1} / {uiTourSteps.length}</div>
          <div className="flex items-center justify-between gap-3 sm:order-1 sm:flex-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={stepIndex === 0}
              className="rounded-md border border-stone-700 px-3 py-2 text-sm text-stone-200 disabled:opacity-40"
            >
              Previous
            </button>
            {stepIndex === uiTourSteps.length - 1 ? (
              <button type="button" onClick={onClose} className="ml-auto rounded-md bg-white px-3 py-2 text-sm font-medium text-stone-950">
                Finish
              </button>
            ) : (
              <button type="button" onClick={onNext} className="ml-auto rounded-md bg-white px-3 py-2 text-sm font-medium text-stone-950">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const tutorialSteps = [
  {
    title: 'Understand what HumanBoard is for',
    body: 'HumanBoard is a second-brain workspace for unfinished thinking. It helps you capture raw material first, then distill it into knowledge, goals, and patterns worth revisiting.',
  },
  {
    title: 'Capture anything before it disappears',
    body: 'Start in Inbox. Drop in rough thoughts, links, screenshots, questions, signals, and fragments without needing to organize them perfectly in the moment.',
  },
  {
    title: 'Turn raw notes into structured knowledge',
    body: 'When a note becomes useful, promote it into Ideas. Ideas are where vague inputs become cleaner concepts, decisions, principles, and reusable knowledge.',
  },
  {
    title: 'Connect ideas to goals and long bets',
    body: 'Use Goals for active direction and Incubation for longer-horizon bets. HumanBoard becomes powerful when notes, ideas, and ambitions are linked instead of stored in isolation.',
  },
  {
    title: 'Let the system resurface what matters',
    body: 'Review, maps, and AI guidance help surface stale threads, contradictions, emerging themes, and next actions so your board can think back with you over time.',
  },
] as const;

function TutorialModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (open) setCurrentStep(0);
  }, [open]);

  const handleClose = () => {
    localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, 'true');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-2xl">
        <div className="sticky top-0 z-10 bg-white/95 dark:bg-stone-950/95 backdrop-blur border-b border-stone-200 dark:border-stone-800 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-400 dark:text-stone-500">Onboarding</div>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">HumanBoard Guide</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Step {currentStep + 1} of {tutorialSteps.length}. Move through the board one section at a time.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
            aria-label="Close guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <div className="mb-5 flex gap-2">
            {tutorialSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                onClick={() => setCurrentStep(index)}
                className={cn(
                  'h-2 flex-1 rounded-full transition-all',
                  index === currentStep
                    ? 'bg-stone-900 dark:bg-stone-100'
                    : 'bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700'
                )}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          <div className="grid gap-3">
            {tutorialSteps.map((step, index) => {
              const isActive = index === currentStep;
              return (
                <div
                  key={step.title}
                  className={cn(
                    'rounded-md border p-4 transition-all duration-200',
                    isActive
                      ? 'border-stone-900 bg-stone-50 shadow-sm dark:border-stone-100 dark:bg-stone-900/90'
                      : 'border-stone-200 bg-stone-50/50 opacity-35 dark:border-stone-800 dark:bg-stone-900/40'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-xs font-semibold transition-colors',
                      isActive
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950'
                        : 'bg-stone-300 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                    )}>
                      {index + 1}
                    </div>
                    <div>
                      <h3 className={cn(
                        'text-sm font-semibold transition-colors',
                        isActive ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'
                      )}>{step.title}</h3>
                      <p className={cn(
                        'mt-1 text-sm leading-6 transition-colors',
                        isActive ? 'text-stone-700 dark:text-stone-300' : 'text-stone-400 dark:text-stone-500'
                      )}>{step.body}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            Best first move: capture one real thought in Inbox, then decide whether it should stay raw, become an Idea, connect to a Goal, or turn into a longer-horizon bet.
          </div>

          <div className="mt-5 border-t border-stone-200 pt-4 dark:border-stone-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-stone-500 dark:text-stone-400 sm:order-2">{tutorialSteps[currentStep].title}</div>
              <div className="flex items-center justify-between gap-3 sm:order-1 sm:flex-1">
                <button
                  type="button"
                  onClick={() => setCurrentStep((step) => Math.max(0, step - 1))}
                  disabled={currentStep === 0}
                  className="rounded-md border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-900"
                >
                  Previous
                </button>
                {currentStep === tutorialSteps.length - 1 ? (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
                  >
                    Finish
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((step) => Math.min(tutorialSteps.length - 1, step + 1))}
                    className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}function GuideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tour="tour-guide-button"
      className="flex items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Guide</span>
    </button>
  );
}

function DocsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
    >
      <BookOpen className="h-4 w-4" />
      <span>Docs</span>
    </button>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
    >
      <SettingsIcon className="h-4 w-4" />
      <span>Settings</span>
    </button>
  );
}

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [autoDistillLevel, setAutoDistillLevel] = useState<AutoDistillLevel>(() => getStoredAutoDistillLevel());

  useEffect(() => {
    if (open) setAutoDistillLevel(getStoredAutoDistillLevel());
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-stone-950/60" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-stone-900 dark:text-stone-100">Settings</div>
            <div className="text-sm text-stone-500 dark:text-stone-400">More preferences can live here later.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">Auto-distill</div>
          <select
            value={autoDistillLevel}
            onChange={(event) => {
              const next = event.target.value as AutoDistillLevel;
              setAutoDistillLevel(next);
              setStoredAutoDistillLevel(next);
            }}
            className="mt-3 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
          >
            {AUTO_DISTILL_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>{level.label}</option>
            ))}
          </select>
          <div className="mt-2 text-[11px] text-stone-500 dark:text-stone-500">
            {AUTO_DISTILL_LEVELS.find((level) => level.value === autoDistillLevel)?.description}
          </div>
        </label>
      </div>
    </div>
  );
}

function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <button type="button" aria-label="Close docs" className="absolute inset-0 bg-stone-950/40 dark:bg-stone-950/60" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-3xl h-[80vh] flex flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-800 dark:bg-stone-950 transition-all">
        <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-stone-700 dark:text-stone-300" />
              <span>Product Knowledge & Documentation</span>
            </div>
            <div className="text-sm text-stone-500 dark:text-stone-400">Official features, guide specifications, and behavior directives.</div>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 prose prose-stone dark:prose-invert max-w-none text-stone-800 dark:text-stone-200">
          <div className="space-y-4 text-sm leading-relaxed
            [&>h1]:text-2xl [&>h1]:font-bold [&>h1]:text-stone-900 dark:[&>h1]:text-stone-100 [&>h1]:mt-6 [&>h1]:mb-4
            [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-stone-900 dark:[&>h2]:text-stone-100 [&>h2]:mt-6 [&>h2]:mb-2 [&>h2]:pb-1 [&>h2]:border-b [&>h2]:border-stone-100 dark:[&>h2]:border-stone-800
            [&>h3]:text-base [&>h3]:font-medium [&>h3]:text-stone-900 dark:[&>h3]:text-stone-100 [&>h3]:mt-4 [&>h3]:mb-1
            [&>ul]:list-disc [&>ul]:pl-5 [&>ul]:space-y-2
            [&>li>strong]:text-stone-900 dark:[&>li>strong]:text-stone-100
            [&>p]:text-stone-600 dark:[&>p]:text-stone-400
            [&>code]:bg-stone-100 dark:[&>code]:bg-stone-900 [&>code]:px-1 [&>code]:py-0.5 [&>code]:rounded [&>code]:text-xs [&>code]:font-mono">
            <ReactMarkdown>
              {productDocs}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
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

function Sidebar({ onOpenTutorial, onOpenSettings, onOpenDocs }: { onOpenTutorial: () => void; onOpenSettings: () => void; onOpenDocs: () => void }) {
  const { isDarkMode, toggleDarkMode } = useAppStore();
  const { user, signOutUser } = useAuthStore();
  const isLocalCommandCenter = window.location.port === '3010';
  const workspaceNavItems = [
    ...(isLocalCommandCenter ? [{ to: '/command-center', icon: LayoutDashboard, label: 'Command Center' }] : []),
    { to: '/', icon: Inbox, label: 'Inbox' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/incubation', icon: Radar, label: 'Incubation' },
    { to: '/map', icon: Network, label: 'Map' },
    { to: '/review', icon: RefreshCw, label: 'Review' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/fusion', icon: FileText, label: 'Fusion' },
    { to: '/search', icon: SearchIcon, label: 'Search' },
  ];
  const publicNavItems = [
    { to: '/shared', icon: Layers, label: 'Posts' },
    { to: '/shared/notes', icon: FileText, label: 'Notes' },
    { to: '/shared/discover', icon: Compass, label: 'Discover' },
    { to: '/subscribers', icon: Users, label: 'Subscribers' },
  ];
  const navItems = [...workspaceNavItems, ...publicNavItems];

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
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isPublicSection = publicNavItems.some((p) => p.to === item.to);
          const isFirstInPublicSection = isPublicSection && item.to === publicNavItems[0].to;
          return (
            <div key={item.to}>
              {isFirstInPublicSection && (
                <div className="pt-4 pb-2 px-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 flex items-center gap-1.5">
                    <Globe className="h-3 w-3" />
                    Public
                  </div>
                </div>
              )}
              <NavLink
                to={item.to}
                data-tour={item.label === 'Inbox' ? 'tour-sidebar-inbox' : item.label === 'Ideas' ? 'tour-sidebar-ideas' : item.label === 'Goals' ? 'tour-sidebar-goals' : item.label === 'Incubation' ? 'tour-sidebar-incubation' : item.label === 'Review' ? 'tour-sidebar-review' : item.label === 'Projects' ? 'tour-sidebar-projects' : undefined}
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
            </div>
          );
        })}
      </nav>
      <div className="p-4 border-t border-stone-200 dark:border-stone-800 space-y-2">
        <UpdateButton />
        <NotificationCenter />
        <GuideButton onClick={onOpenTutorial} />
        <DocsButton onClick={onOpenDocs} />
        <SettingsButton onClick={onOpenSettings} />
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

  useEffect(() => {
    document.title = "HumanBoard - Turn scattered thoughts into direction";
    
    // Dynamic canonical tag for landing page
    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = 'canonical';
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = window.location.origin.replace(/^http:/, 'https:') + '/';

    // Dynamic meta description
    let metaDescription = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = "HumanBoard is your personal thinking workspace. Capture raw thoughts, links, and fragments, selectively distill key insights, and connect them to your goals and projects.";
  }, []);

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

      <main className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 pb-12 pt-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(560px,1.1fr)] lg:items-center lg:gap-14 lg:px-12 lg:pb-14 lg:pt-10">
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

          <a
            href="#flagship-overview"
            className="mt-7 inline-flex items-center gap-2 text-xs font-semibold uppercase text-stone-500 transition-colors hover:text-emerald-700 dark:text-stone-400 dark:hover:text-emerald-400"
          >
            Explore flagship functions
            <ChevronDown className="h-4 w-4" />
          </a>
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

      <section id="flagship-overview" className="scroll-mt-4 border-y border-stone-300 bg-white dark:border-stone-800 dark:bg-stone-950">
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

function PersistErrorBanner() {
  const lastPersistError = useAppStore((state) => state.lastPersistError);
  const persistRetry = useAppStore((state) => state.persistRetry);
  const clearPersistError = useAppStore((state) => state.clearPersistError);
  const [retrying, setRetrying] = useState(false);

  if (!lastPersistError) return null;

  const isPayloadTooLarge = /too large|413|payload/i.test(lastPersistError);

  return (
    <div
      role="status"
      className="fixed top-2 inset-x-2 z-[130] md:left-auto md:right-4 md:top-4 md:max-w-md mx-auto"
    >
      <div className="rounded-lg border border-rose-300/80 dark:border-rose-900 bg-rose-50/95 dark:bg-rose-950/90 text-rose-900 dark:text-rose-100 shadow-lg backdrop-blur px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="text-sm font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
            Save failed
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="ml-auto text-rose-700/70 dark:text-rose-300/70 hover:text-rose-900 dark:hover:text-rose-100"
            onClick={() => clearPersistError()}
          >
            ×
          </button>
        </div>
        <p className="mt-1 text-sm leading-snug">
          {isPayloadTooLarge
            ? 'The current board is too large to sync to the server. Try trimming very large fusion bodies or removing old notes, then retry.'
            : 'Your last change did not sync to the server. Local changes are still in memory but may be lost on reload.'}
        </p>
        <details className="mt-1 text-xs opacity-80">
          <summary className="cursor-pointer select-none">Technical detail</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight">
{lastPersistError}
          </pre>
        </details>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-60"
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                await persistRetry();
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? 'Retrying…' : 'Retry save'}
          </button>
          <button
            type="button"
            className="rounded-md border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-semibold px-3 py-1.5 hover:bg-rose-100/60 dark:hover:bg-rose-900/40 transition-colors"
            onClick={() => clearPersistError()}
          >
            Dismiss
          </button>
        </div>
      </div>
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
  navItems,
  onClose,
  onOpenTutorial,
  onOpenDocs,
  onOpenSettings,
}: {
  open: boolean;
  navItems: Array<{ to: string; icon: typeof Inbox; label: string }>;
  onClose: () => void;
  onOpenTutorial: () => void;
  onOpenDocs: () => void;
  onOpenSettings: () => void;
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
      <div className="absolute right-0 top-0 h-full w-[85vw] max-w-xs border-l border-stone-200 bg-white p-4 shadow-2xl dark:border-stone-800 dark:bg-stone-950 flex flex-col justify-between">
        <div>
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
                data-tour={item.label === 'Inbox' ? 'tour-sidebar-inbox' : item.label === 'Ideas' ? 'tour-sidebar-ideas' : item.label === 'Goals' ? 'tour-sidebar-goals' : item.label === 'Incubation' ? 'tour-sidebar-incubation' : item.label === 'Review' ? 'tour-sidebar-review' : item.label === 'Projects' ? 'tour-sidebar-projects' : undefined}
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
          <DocsButton
            onClick={() => {
              onClose();
              onOpenDocs();
            }}
          />
          <SettingsButton
            onClick={() => {
              onClose();
              onOpenSettings();
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
  const [isSpotlightTourOpen, setIsSpotlightTourOpen] = useState(false);
  const [spotlightStepIndex, setSpotlightStepIndex] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const navItems = [
    ...(isLocalCommandCenter ? [{ to: '/command-center', icon: LayoutDashboard, label: 'Command Center' }] : []),
    { to: '/', icon: Inbox, label: 'Inbox' },
    { to: '/ideas', icon: Lightbulb, label: 'Ideas' },
    { to: '/goals', icon: Target, label: 'Goals' },
    { to: '/incubation', icon: Radar, label: 'Incubation' },
    { to: '/map', icon: Network, label: 'Map' },
    { to: '/review', icon: RefreshCw, label: 'Review' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/fusion', icon: FileText, label: 'Fusion' },
    { to: '/search', icon: SearchIcon, label: 'Search' },
    { to: '/shared', icon: Layers, label: 'Posts' },
    { to: '/shared/notes', icon: FileText, label: 'Notes' },
    { to: '/shared/discover', icon: Compass, label: 'Discover' },
    { to: '/subscribers', icon: Users, label: 'Subscribers' },
  ];

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Mirror storage save results into the store so we can show a banner when
  // the server save fails (the previous "silent catch" hid this for too long).
  useEffect(() => {
    return subscribeSaveResults((result) => {
      useAppStore.setState({
        lastPersistAt: new Date().toISOString(),
        // Show the banner whenever either layer failed — local OR server.
        // The server is the cross-device source of truth, so a server
        // failure means the change is at risk if the user reloads or
        // opens a different device.
        lastPersistError: result.ok
          ? null
          : (result.error ?? (result.serverSkipped
              ? 'Server save skipped (no auth?). Local-only persistence is in effect.'
              : 'unknown error')),
      });
    });
  }, []);

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

  useEffect(() => {
    if (!isAuthReady || !userId || !hasHydratedUserSnapshot) return;
    const seen = localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY);
    const autoOpened = sessionStorage.getItem(onboardingAutoOpenedKey(userId));
    if (!seen && !autoOpened) {
      setIsTutorialOpen(true);
      setIsSpotlightTourOpen(true);
      setSpotlightStepIndex(0);
      sessionStorage.setItem(onboardingAutoOpenedKey(userId), 'true');
    }
  }, [isAuthReady, userId, hasHydratedUserSnapshot]);

  const openGuide = () => {
    setIsTutorialOpen(true);
    setIsSpotlightTourOpen(true);
    setSpotlightStepIndex(0);
  };

  const closeGuide = () => {
    setIsTutorialOpen(false);
    setIsSpotlightTourOpen(false);
  };

  const isPublicRoute = window.location.pathname.startsWith('/shared/fusion/');

  if (isPublicRoute) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/shared/fusion/:id" element={<PublicFusionPage />} />
          <Route path="/shared" element={<PublicFusionIndexPage />} />
          <Route path="/shared/author/:name" element={<PublicAuthorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

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
      <SettingsModal open={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <DocsModal open={isDocsOpen} onClose={() => setIsDocsOpen(false)} />
      <TutorialModal open={isTutorialOpen && !isSpotlightTourOpen} onClose={closeGuide} />
      <SpotlightTour
        open={isSpotlightTourOpen}
        stepIndex={spotlightStepIndex}
        onPrev={() => setSpotlightStepIndex((step) => Math.max(0, step - 1))}
        onNext={() => setSpotlightStepIndex((step) => Math.min(uiTourSteps.length - 1, step + 1))}
        onClose={closeGuide}
      />
      <MobileMenu
        open={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        navItems={navItems}
        onOpenTutorial={openGuide}
        onOpenDocs={() => setIsDocsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <PersistErrorBanner />
      <DebugPanel />
      <div className="flex min-h-screen bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 font-sans selection:bg-stone-200 dark:selection:bg-stone-800 transition-colors duration-300">
        <Sidebar onOpenTutorial={openGuide} onOpenSettings={() => setIsSettingsOpen(true)} onOpenDocs={() => setIsDocsOpen(true)} />
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
            {isLocalCommandCenter && <Route path="/command-center" element={<CommandCenterPage />} />}
            <Route path="/" element={<InboxPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/ideas/:id" element={<IdeaDetailPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/incubation" element={<IncubationPage />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/fusion" element={<FusionPage />} />
            <Route path="/fusion/:id" element={<FusionDetailPage />} />
            <Route path="/shared/fusion/:id" element={<PublicFusionPage />} />
            <Route path="/shared" element={<PublicFusionIndexPage />} />
            <Route path="/shared/author/:name" element={<PublicAuthorPage />} />
            <Route path="/shared/notes" element={<PublicNotesPage />} />
            <Route path="/shared/notes/:id" element={<PublicNoteDetailPage />} />
            <Route path="/shared/discover" element={<PublicDiscoverPage />} />
            <Route path="/subscribers" element={<SubscribersPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Chatbot />
      </div>
    </BrowserRouter>
  );
}
