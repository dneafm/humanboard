import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Brain, CheckCircle2, Clock3, DollarSign, Download, FolderKanban, Inbox, Network, RefreshCw, RotateCcw, Search, Shield, Target, Users, Wallet, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';
import { useAppStore, hydrateAppStoreFromRepository } from '../store';

type HealthPayload = {
  ok: boolean;
  service: string;
  distReady: boolean;
  userDataDir: string;
  aiBaseUrl: string;
};

type VersionPayload = {
  version: string;
  latestGithubVersion?: string | null;
  updateAvailable?: boolean;
};

type AiCostTracking = {
  totals: {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedUsd: number;
  };
  byModel: Record<string, {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedUsd: number;
  }>;
  recent: Array<{
    at: string;
    requestId: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedUsd: number;
    path: string;
  }>;
};

type AdminOverview = {
  users: Array<{
    userId: string;
    notes: number;
    ideas: number;
    projects: number;
    goals: number;
    reflections: number;
    capabilityBets: number;
    signalEvents: number;
    trackedRequests: number;
    trackedUsd: number;
    lastUpdatedAt: string | null;
    error?: string;
  }>;
  totals: {
    users: number;
    notes: number;
    ideas: number;
    projects: number;
    goals: number;
    reflections: number;
    capabilityBets: number;
    signalEvents: number;
    trackedRequests: number;
    trackedUsd: number;
  };
};

type AdminEvents = {
  events: Array<{
    id: string;
    at: string;
    level: 'info' | 'warn' | 'error';
    type: string;
    message: string;
    meta?: Record<string, unknown>;
  }>;
};

const emptyCosts: AiCostTracking = {
  totals: {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
  },
  byModel: {},
  recent: [],
};

const emptyAdminOverview: AdminOverview = {
  users: [],
  totals: { users: 0, notes: 0, ideas: 0, projects: 0, goals: 0, reflections: 0, capabilityBets: 0, signalEvents: 0, trackedRequests: 0, trackedUsd: 0 },
};

const emptyAdminEvents: AdminEvents = { events: [] };

function formatUsd(value: number) {
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Card({ title, value, hint, icon: Icon }: { title: string; value: string; hint: string; icon: typeof Inbox }) {
  return (
    <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{title}</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{value}</div>
          <div className="mt-2 text-sm text-stone-500 dark:text-stone-400">{hint}</div>
        </div>
        <div className="rounded-lg bg-stone-100 dark:bg-stone-800 p-2.5 text-stone-700 dark:text-stone-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function TinyBarChart({ values, labels, colorClass }: { values: number[]; labels: string[]; colorClass: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 h-24">
        {values.map((value, index) => (
          <div key={`${labels[index]}-${index}`} className="flex-1 flex flex-col items-center gap-2">
            <div className="text-[10px] text-stone-500 dark:text-stone-400">{value}</div>
            <div className="w-full rounded-t-md bg-stone-100 dark:bg-stone-800 overflow-hidden">
              <div className={`${colorClass} rounded-t-md`} style={{ height: `${Math.max(8, (value / max) * 80)}px` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-[10px] uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
        {labels.map((label) => (
          <div key={label} className="flex-1 text-center">{label}</div>
        ))}
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const notes = useAppStore((state) => state.notes);
  const ideas = useAppStore((state) => state.ideas);
  const projects = useAppStore((state) => state.projects);
  const goals = useAppStore((state) => state.goals);
  const reflections = useAppStore((state) => state.reflections);
  const capabilityBets = useAppStore((state) => state.capabilityBets);
  const user = useAuthStore((state) => state.user);
  const userId = useAuthStore((state) => state.userId);

  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [version, setVersion] = useState<VersionPayload | null>(null);
  const [costs, setCosts] = useState<AiCostTracking>(emptyCosts);
  const [adminOverview, setAdminOverview] = useState<AdminOverview>(emptyAdminOverview);
  const [adminEvents, setAdminEvents] = useState<AdminEvents>(emptyAdminEvents);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    const [healthRes, versionRes, costsRes, overviewRes, eventsRes] = await Promise.all([
      apiFetch('/api/health', { cache: 'no-store' }),
      apiFetch('/api/version', { cache: 'no-store' }),
      userId ? apiFetch('/api/ai-costs', { cache: 'no-store' }) : Promise.resolve(null),
      apiFetch('/api/admin/overview', { cache: 'no-store' }),
      apiFetch('/api/admin/events', { cache: 'no-store' }),
    ]);

    if (!healthRes.ok) throw new Error('Failed to load health');
    if (!versionRes.ok) throw new Error('Failed to load version');
    if (costsRes && !costsRes.ok) throw new Error('Failed to load AI costs');
    if (!overviewRes.ok) throw new Error('Failed to load admin overview');
    if (!eventsRes.ok) throw new Error('Failed to load admin events');

    const [healthPayload, versionPayload, costsPayload, overviewPayload, eventsPayload] = await Promise.all([
      healthRes.json() as Promise<HealthPayload>,
      versionRes.json() as Promise<VersionPayload>,
      costsRes ? costsRes.json() as Promise<AiCostTracking> : Promise.resolve(emptyCosts),
      overviewRes.json() as Promise<AdminOverview>,
      eventsRes.json() as Promise<AdminEvents>,
    ]);

    setHealth(healthPayload);
    setVersion(versionPayload);
    setCosts(costsPayload);
    setAdminOverview(overviewPayload);
    setAdminEvents(eventsPayload);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        await loadAll();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load Command Center');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const derived = useMemo(() => {
    const reviewCandidates = ideas.filter((idea) => idea.stage !== 'Archived').length + reflections.length;
    const activeProjects = projects.filter((project) => project.status === 'Active').length;
    const activeGoals = goals.filter((goal) => goal.status === 'Active').length;
    const capturedKnowledge = notes.length + ideas.length + reflections.length;
    const strategicArtifacts = goals.length + capabilityBets.length + projects.length;
    const totalSignals = adminOverview.totals.signalEvents + capabilityBets.length;
    const staleIdeas = ideas.filter((idea) => {
      const reviewedAt = new Date(idea.lastReviewed).getTime();
      return Number.isFinite(reviewedAt) && Date.now() - reviewedAt > 1000 * 60 * 60 * 24 * 14;
    }).length;

    const recentCosts = costs.recent.slice(0, 7).reverse();
    const requestChart = recentCosts.map((entry) => entry.totalTokens);
    const spendChart = recentCosts.map((entry) => Number(entry.estimatedUsd.toFixed(4)));
    const labels = recentCosts.map((entry) => new Date(entry.at).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));

    const alertCards = [
      {
        label: 'Stale ideas',
        value: staleIdeas,
        tone: staleIdeas > 5 ? 'warn' : 'ok',
        description: 'Ideas not reviewed in 14+ days',
      },
      {
        label: 'Review load',
        value: reviewCandidates,
        tone: reviewCandidates > 15 ? 'warn' : 'ok',
        description: 'Ideas + reflections needing attention',
      },
      {
        label: 'Provider errors',
        value: adminEvents.events.filter((event) => event.level === 'error').length,
        tone: adminEvents.events.some((event) => event.level === 'error') ? 'warn' : 'ok',
        description: 'Recent runtime error events',
      },
    ];

    return {
      reviewCandidates,
      activeProjects,
      activeGoals,
      capturedKnowledge,
      strategicArtifacts,
      totalSignals,
      staleIdeas,
      requestChart,
      spendChart,
      labels,
      alertCards,
    };
  }, [costs.recent, goals, ideas, projects, reflections, adminEvents.events, notes.length, capabilityBets.length, adminOverview.totals.signalEvents]);

  const topModels = Object.entries(costs.byModel)
    .sort((a, b) => b[1].estimatedUsd - a[1].estimatedUsd)
    .slice(0, 5);

  const quickActions = [
    { to: '/', label: 'Open Inbox', icon: Inbox },
    { to: '/review', label: 'Open Review', icon: RefreshCw },
    { to: '/map', label: 'Open Map', icon: Network },
    { to: '/projects', label: 'Open Projects', icon: FolderKanban },
    { to: '/workflow', label: 'Open Workflow', icon: Workflow },
    { to: '/search', label: 'Open Search', icon: Search },
  ];

  const handleExportSnapshot = async () => {
    try {
      const response = await apiFetch('/api/snapshot', { cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to export snapshot');
      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `humanboard-snapshot-${userId || 'user'}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setActionMessage('Snapshot exported.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to export snapshot');
    }
  };

  const handleResetSnapshot = async () => {
    const confirmed = window.confirm('Reset this user snapshot to default? This will clear board state for the current user.');
    if (!confirmed) return;
    try {
      setIsResetting(true);
      const response = await apiFetch('/api/snapshot/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to reset snapshot');
      await hydrateAppStoreFromRepository();
      await loadAll();
      setActionMessage('Snapshot reset to default.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to reset snapshot');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Command Center</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">HumanBoard operating view</h1>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">Unified home for system health, knowledge flow, per-user AI cost, and admin overview.</p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2 text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">{error}</div>}
        {actionMessage && <div className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 text-sm text-stone-700 dark:text-stone-200 shadow-sm">{actionMessage}</div>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card title="Knowledge captured" value={String(derived.capturedKnowledge)} hint={`${notes.length} notes · ${ideas.length} ideas · ${reflections.length} reflections`} icon={Inbox} />
          <Card title="Review pressure" value={String(derived.reviewCandidates)} hint={`${derived.staleIdeas} stale ideas need attention`} icon={Brain} />
          <Card title="Strategy in motion" value={String(derived.strategicArtifacts)} hint={`${derived.activeProjects} active projects · ${derived.activeGoals} active goals`} icon={FolderKanban} />
          <Card title="Signal volume" value={String(derived.totalSignals)} hint={`${adminOverview.totals.signalEvents} saved signals across users`} icon={DollarSign} />
        </div>

        <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-stone-500" />
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Alerts</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {derived.alertCards.map((alert) => (
              <div key={alert.label} className={`rounded-lg border p-4 ${alert.tone === 'warn' ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30'}`}>
                <div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{alert.label}</div>
                <div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{alert.value}</div>
                <div className="mt-1 text-sm text-stone-600 dark:text-stone-400">{alert.description}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Quick actions</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Jump into the main board loops and admin utilities.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {quickActions.map((item) => (
                <Link key={item.to} to={item.to} className="rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-4 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                  <item.icon className="h-5 w-5 text-stone-700 dark:text-stone-200" />
                  <div className="mt-3 text-sm font-medium text-stone-900 dark:text-stone-100">{item.label}</div>
                </Link>
              ))}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => void handleExportSnapshot()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3 text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800">
                <Download className="h-4 w-4" /> Export snapshot
              </button>
              <button type="button" disabled={isResetting} onClick={() => void handleResetSnapshot()} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> {isResetting ? 'Resetting…' : 'Reset user snapshot'}
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">System</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Runtime, version, and provider state.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-stone-50 dark:bg-stone-950 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Current user</div><div className="mt-2 text-sm font-medium text-stone-900 dark:text-stone-100">{user?.displayName || user?.email || userId || 'Unknown user'}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400 break-all">{userId}</div></div>
              <div className="rounded-lg bg-stone-50 dark:bg-stone-950 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">App version</div><div className="mt-2 text-sm font-medium text-stone-900 dark:text-stone-100">{version?.version || '—'}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{version?.updateAvailable ? `Update available: ${version.latestGithubVersion}` : 'Up to date or unknown'}</div></div>
              <div className="rounded-lg bg-stone-50 dark:bg-stone-950 p-4 md:col-span-2"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">AI runtime</div><div className="mt-2 text-sm font-medium text-stone-900 dark:text-stone-100 break-all">{health?.aiBaseUrl || '—'}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Dist ready: {health?.distReady ? 'yes' : 'no'} · Service: {health?.service || '—'}</div></div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Knowledge flow</h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">How the board is filling, maturing, and demanding attention.</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Review queue</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.reviewCandidates}</div></div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Active goals</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{derived.activeGoals}</div></div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Capability bets</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{capabilityBets.length}</div></div>
              <div className="rounded-lg border border-stone-200 dark:border-stone-800 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Reflections</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{reflections.length}</div></div>
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-stone-500" /><h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Per-user AI cost</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-stone-50 dark:bg-stone-950 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Total spend</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{formatUsd(costs.totals.estimatedUsd)}</div></div>
              <div className="rounded-lg bg-stone-50 dark:bg-stone-950 p-4"><div className="text-xs uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">Tokens</div><div className="mt-2 text-2xl font-semibold text-stone-900 dark:text-stone-100">{costs.totals.totalTokens}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">P {costs.totals.promptTokens} · C {costs.totals.completionTokens}</div></div>
            </div>
            <div className="mt-5 space-y-3">
              {topModels.length === 0 ? <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-4 text-sm text-stone-500 dark:text-stone-400">No successful tracked chat cost yet for this user.</div> : topModels.map(([model, stats]) => (
                <div key={model} className="rounded-lg border border-stone-200 dark:border-stone-800 p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{model}</div><div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{stats.requests} requests · {stats.totalTokens} tokens</div></div><div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{formatUsd(stats.estimatedUsd)}</div></div></div>
              ))}
            </div>
          </section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm"><div className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-stone-500" /><h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Cost trend</h2></div><div className="mt-4">{derived.spendChart.length === 0 ? <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-4 text-sm text-stone-500 dark:text-stone-400">Need recent successful completions to chart spend.</div> : <TinyBarChart values={derived.spendChart} labels={derived.labels} colorClass="bg-emerald-500/80" />}</div></section>
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-stone-500" /><h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Token trend</h2></div><div className="mt-4">{derived.requestChart.length === 0 ? <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-4 text-sm text-stone-500 dark:text-stone-400">Need recent successful completions to chart token usage.</div> : <TinyBarChart values={derived.requestChart} labels={derived.labels} colorClass="bg-blue-500/80" />}</div></section>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <div className="flex items-center gap-2"><Users className="h-4 w-4 text-stone-500" /><h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Cross-user overview</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card title="Users" value={String(adminOverview.totals.users)} hint="Profiles with saved data" icon={Users} />
              <Card title="All knowledge" value={String(adminOverview.totals.notes + adminOverview.totals.ideas + adminOverview.totals.reflections)} hint={`${adminOverview.totals.notes} notes · ${adminOverview.totals.ideas} ideas · ${adminOverview.totals.reflections} reflections`} icon={Inbox} />
              <Card title="Signals" value={String(adminOverview.totals.signalEvents)} hint="Saved signal events across users" icon={Bot} />
              <Card title="Plans & bets" value={String(adminOverview.totals.projects + adminOverview.totals.goals + adminOverview.totals.capabilityBets)} hint={`${adminOverview.totals.projects} projects · ${adminOverview.totals.goals} goals · ${adminOverview.totals.capabilityBets} bets`} icon={DollarSign} />
            </div>
            <div className="mt-5 space-y-3">
              {adminOverview.users.slice(0, 8).map((entry) => (
                <div key={entry.userId} className="rounded-lg border border-stone-200 dark:border-stone-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{entry.userId}</div>
                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{entry.notes} notes · {entry.ideas} ideas · {entry.reflections} reflections</div>
                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{entry.projects} projects · {entry.goals} goals · {entry.capabilityBets} bets · {entry.signalEvents} signals</div>
                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">Updated {formatTime(entry.lastUpdatedAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">{formatUsd(entry.trackedUsd)}</div>
                      <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{entry.trackedRequests} reqs</div>
                    </div>
                  </div>
                  {entry.error && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{entry.error}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-5 shadow-sm">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-stone-500" /><h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Runtime event feed</h2></div>
            <div className="mt-4 space-y-3">
              {adminEvents.events.length === 0 ? <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-4 text-sm text-stone-500 dark:text-stone-400">No runtime events yet.</div> : adminEvents.events.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-lg border border-stone-200 dark:border-stone-800 p-4">
                  <div className="flex items-center justify-between gap-3"><div className="text-sm font-medium text-stone-900 dark:text-stone-100">{event.type}</div><div className={`text-xs font-medium ${event.level === 'error' ? 'text-red-600 dark:text-red-400' : event.level === 'warn' ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>{event.level}</div></div>
                  <div className="mt-1 text-sm text-stone-600 dark:text-stone-300 break-words">{event.message}</div>
                  <div className="mt-2 text-xs text-stone-500 dark:text-stone-400">{formatTime(event.at)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
