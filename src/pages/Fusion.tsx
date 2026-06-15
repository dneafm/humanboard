import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Sparkles, CheckCircle2, PenSquare, WandSparkles, RefreshCw, Trash2, Loader2, BookOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { type FusionAudience, type FusionItem, type FusionStatus, type FusionType, type FusionSuggestion, useAppStore } from '../store';
import { askGemma } from '../lib/ai';

const fusionTypes: FusionType[] = ['Post', 'Writing', 'Thesis', 'Report'];
const fusionStatuses: FusionStatus[] = ['Draft', 'Synthesizing', 'Ready', 'Completed'];
const fusionAudiences: FusionAudience[] = ['Personal', 'Team', 'Public', 'Client'];

export default function FusionPage() {
  const navigate = useNavigate();
  const {
    fusionItems,
    addFusionItem,
    deleteFusionItem,
    fusionSuggestions,
    lastDailyFusionScan,
    setFusionSuggestions,
    setLastDailyFusionScan,
    dismissFusionSuggestion,
    notes,
    ideas,
    projects,
    goals,
    capabilityBets,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | FusionType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | FusionStatus>('All');
  const [audienceFilter, setAudienceFilter] = useState<'All' | FusionAudience>('All');
  const [sortBy, setSortBy] = useState<'updated' | 'readiness' | 'type'>('updated');

  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const runSynthesisInsightScan = async (force = false) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanError(null);

    try {
      const now = new Date();
      if (!force && lastDailyFusionScan) {
        const lastScanDate = new Date(lastDailyFusionScan);
        const diffHours = (now.getTime() - lastScanDate.getTime()) / (1000 * 60 * 60);
        if (diffHours < 24) {
          setIsScanning(false);
          return;
        }
      }

      if (notes.length === 0 && ideas.length === 0 && fusionItems.length === 0 && capabilityBets.length === 0) {
        setScanError('Not enough vault material to detect patterns yet. Add some materials first!');
        setIsScanning(false);
        return;
      }

      const prompt = `You are the HumanBoard Daily Synthesis Insight Engine.
Analyze the following vault material to find patterns, themes, or logical connections.
Identify up to 20 potential "Fusions" (writings, reports, articles, or theses) that can be generated from these materials.

Raw Notes:
${notes.slice(0, 40).map(n => `- ID: ${n.id} | Date: ${n.createdAt} | Content: ${n.content.slice(0, 300)}`).join('\n')}

Ideas:
${ideas.slice(0, 40).map(i => `- ID: ${i.id} | Title: ${i.title} | Content: ${i.content.slice(0, 300)}`).join('\n')}

Existing Fusions:
${fusionItems.slice(0, 40).map(f => `- ID: ${f.id} | ${f.type}/${f.status} | Title: ${f.title} | Summary: ${(f.summary || f.centralConclusion || f.body).slice(0, 300)}`).join('\n')}

Capability Bets:
${capabilityBets.filter(b => !b.archivedAt).slice(0, 30).map(b => `- ID: ${b.id} | ${b.status} | Title: ${b.title} | Thesis: ${b.thesis.slice(0, 300)} | Keywords: ${b.keywords.join(', ')}`).join('\n')}

Active Goals and Projects:
${[
  ...goals.filter(g => g.status === 'Active').slice(0, 12).map(g => `- Goal ID: ${g.id} | ${g.title}: ${g.description.slice(0, 240)}`),
  ...projects.filter(p => p.status !== 'Completed').slice(0, 12).map(p => `- Project ID: ${p.id} | ${p.status} | ${p.title}: ${p.description.slice(0, 240)}`),
].join('\n')}

Rules:
- Existing fusions are prior synthesized artifacts. Do not suggest duplicates; suggest editing/expanding an existing fusion only when it is the better next step.
- Capability bets are first-class strategic entities. Use them as synthesis anchors when notes and ideas point to a capability, but do not turn a capability bet into a fusion unless there is a concrete argument/report/article to draft.
- Prefer fusions when the output should be a synthesized post, report, thesis, or longform argument. Prefer ideas only for raw concepts; this task returns fusion suggestions only.

For each suggested Fusion, provide:
1. A descriptive title.
2. The recommended type ('Post', 'Writing', 'Thesis', 'Report').
3. A short thesis (summary of what this fusion will compile/explain).
4. The reasoning behind the connection.
5. The list of Note IDs and Idea IDs that should be linked.
6. A readiness score (0-100) based on how complete/detailed the source materials are.

Respond ONLY with a valid JSON array of objects, with no markdown code block formatting or extra explanation, matching this schema:
[
  {
    "title": "Proposed Title",
    "type": "Post" | "Writing" | "Thesis" | "Report",
    "thesis": "Short thesis or summary",
    "reasoning": "Reasoning explaining why these notes/ideas connect",
    "linkedNoteIds": ["note-id-1", ...],
    "linkedIdeaIds": ["idea-id-1", ...],
    "readinessScore": 85
  }
]`;

      const systemInstruction = "You are the HumanBoard Daily Synthesis Insight Engine. You analyze notes, ideas, existing fusions, goals, projects, and capability bets to suggest non-duplicate Fusion artifacts. Respond ONLY with a valid JSON array.";

      const responseText = await askGemma(prompt, systemInstruction);
      const cleanJson = responseText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      const suggestions = JSON.parse(cleanJson);
      if (Array.isArray(suggestions)) {
        const formattedSuggestions = suggestions.map((s: any) => ({
          ...s,
          id: s.id || Math.random().toString(36).substring(2, 10),
          readinessScore: Math.min(100, Math.max(0, Number(s.readinessScore || 0))),
          linkedNoteIds: Array.isArray(s.linkedNoteIds) ? s.linkedNoteIds : [],
          linkedIdeaIds: Array.isArray(s.linkedIdeaIds) ? s.linkedIdeaIds : [],
        }));
        setFusionSuggestions(formattedSuggestions);
        setLastDailyFusionScan(now.toISOString());
      } else {
        throw new Error('Invalid response format from AI. Expected JSON array.');
      }
    } catch (err) {
      console.error(err);
      setScanError(err instanceof Error ? err.message : 'Failed to scan vault for insights.');
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    void runSynthesisInsightScan(false);
  }, []);

  const handleCreateFromSuggestion = (suggestion: FusionSuggestion) => {
    addFusionItem({
      title: suggestion.title,
      type: suggestion.type,
      status: 'Draft',
      summary: suggestion.thesis,
      centralConclusion: '',
      body: '',
      audience: 'Personal',
      linkedNoteIds: suggestion.linkedNoteIds,
      linkedIdeaIds: suggestion.linkedIdeaIds,
      linkedGoalIds: [],
      linkedProjectIds: [],
    });
    const latest = useAppStore.getState().fusionItems[0];
    const nextId = latest?.id ?? '';
    if (nextId) navigate(`/fusion/${nextId}`);
  };

  const handleCreateFusion = () => {
    addFusionItem({
      title: 'Untitled Fusion',
      type: 'Writing',
      status: 'Draft',
      summary: '',
      centralConclusion: '',
      body: '',
      audience: 'Personal',
      linkedNoteIds: [],
      linkedIdeaIds: [],
      linkedGoalIds: [],
      linkedProjectIds: [],
    });
    const latest = useAppStore.getState().fusionItems[0];
    const nextId = latest?.id ?? '';
    if (nextId) navigate(`/fusion/${nextId}`);
  };

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = fusionItems.filter((item) => {
      const matchesQuery = !normalized || [item.title, item.summary, item.centralConclusion, item.body].some((value) => value.toLowerCase().includes(normalized));
      const matchesType = typeFilter === 'All' || item.type === typeFilter;
      const matchesStatus = statusFilter === 'All' || item.status === statusFilter;
      const matchesAudience = audienceFilter === 'All' || item.audience === audienceFilter;
      return matchesQuery && matchesType && matchesStatus && matchesAudience;
    });

    return result.sort((a, b) => {
      if (sortBy === 'readiness') return b.shareReadiness - a.shareReadiness;
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [audienceFilter, fusionItems, query, sortBy, statusFilter, typeFilter]);

  const draftingItems = filteredItems.filter((item) => item.status === 'Draft' || item.status === 'Synthesizing');
  const readyItems = filteredItems.filter((item) => item.status === 'Ready');
  const completedItems = filteredItems.filter((item) => item.status === 'Completed');

  return (
    <div className="max-w-6xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Fusion</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-300">Turn notes and ideas into shareable conclusions.</p>
        </div>
        <button
          type="button"
          onClick={handleCreateFusion}
          className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
        >
          <Plus className="h-4 w-4" />
          New Fusion
        </button>
      </header>

      {/* Daily Synthesis Insights suggestion deck */}
      <section className="mb-8 rounded-2xl border border-stone-200/60 bg-stone-50/50 p-6 dark:border-stone-800/60 dark:bg-stone-900/30 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500 animate-pulse" />
            <div>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>Synthesis Insights</span>
                {lastDailyFusionScan && (
                  <span className="text-xs font-normal text-stone-400 dark:text-stone-500">
                    Last scanned {new Date(lastDailyFusionScan).toLocaleDateString()}
                  </span>
                )}
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">Auto-detected connection clusters ready to fuse into drafts.</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isScanning}
            onClick={() => runSynthesisInsightScan(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-850"
          >
            {isScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isScanning ? 'Scanning...' : 'Scan / Refresh'}
          </button>
        </div>

        {scanError && (
          <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 text-sm text-red-800 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-300 mb-2">
            {scanError}
          </div>
        )}

        {isScanning ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="animate-pulse rounded-xl border border-stone-200/50 bg-white/50 p-4 dark:border-stone-800/50 dark:bg-stone-950/30 h-40 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-3/4 rounded bg-stone-200 dark:bg-stone-850" />
                  <div className="h-3 w-1/4 rounded bg-stone-200 dark:bg-stone-850" />
                  <div className="h-3 w-5/6 rounded bg-stone-200 dark:bg-stone-850 mt-2" />
                </div>
                <div className="h-8 w-24 rounded bg-stone-200 dark:bg-stone-850" />
              </div>
            ))}
          </div>
        ) : fusionSuggestions.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fusionSuggestions.slice(0, 6).map((suggestion) => (
              <div key={suggestion.id} className="relative flex flex-col justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950 hover:shadow-md transition-all">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-stone-100 dark:bg-stone-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                      {suggestion.type}
                    </span>
                    <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded-full">
                      {suggestion.readinessScore}% ready
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-semibold text-stone-900 dark:text-stone-100 line-clamp-1">{suggestion.title}</h3>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400 line-clamp-2">{suggestion.thesis}</p>
                  
                  <div className="mt-3 rounded-lg bg-stone-50 p-2.5 dark:bg-stone-900/50">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Connection reasoning</div>
                    <p className="text-[11px] text-stone-600 dark:text-stone-400 mt-0.5 line-clamp-2">{suggestion.reasoning}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 dark:border-stone-900">
                  <span className="text-[11px] text-stone-400 dark:text-stone-500">
                    {suggestion.linkedNoteIds.length} notes · {suggestion.linkedIdeaIds.length} ideas
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dismissFusionSuggestion(suggestion.id)}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-500 dark:hover:bg-stone-900 transition-colors"
                      title="Dismiss suggestion"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCreateFromSuggestion(suggestion)}
                      className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 transition-all"
                    >
                      <WandSparkles className="h-3 w-3" />
                      <span>Draft</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 bg-white/30 dark:bg-stone-950/10">
            <BookOpen className="h-8 w-8 text-stone-300 dark:text-stone-700 mx-auto mb-2" />
            <p className="text-xs text-stone-500 dark:text-stone-400">No active fusion suggestions. Add more notes or click "Scan" to compile themes.</p>
          </div>
        )}
      </section>

      <div className="mb-8 grid gap-3 md:grid-cols-5">
        <label className="md:col-span-2 flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search fusion..."
            className="w-full bg-transparent text-sm outline-none text-stone-900 dark:text-stone-100"
          />
        </label>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'All' | FusionType)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200">
          <option value="All">All types</option>
          {fusionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'All' | FusionStatus)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200">
          <option value="All">All statuses</option>
          {fusionStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-3">
          <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value as 'All' | FusionAudience)} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200">
            <option value="All">Audience</option>
            {fusionAudiences.map((audience) => <option key={audience} value={audience}>{audience}</option>)}
          </select>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'updated' | 'readiness' | 'type')} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200">
            <option value="updated">Updated</option>
            <option value="readiness">Readiness</option>
            <option value="type">Type</option>
          </select>
        </div>
      </div>

      <FusionSection title="Drafting" icon={PenSquare} items={draftingItems} onOpen={(id) => navigate(`/fusion/${id}`)} onDelete={deleteFusionItem} />
      <FusionSection title="Ready to Share" icon={Sparkles} items={readyItems} onOpen={(id) => navigate(`/fusion/${id}`)} onDelete={deleteFusionItem} />
      <FusionSection title="Completed" icon={CheckCircle2} items={completedItems} onOpen={(id) => navigate(`/fusion/${id}`)} onDelete={deleteFusionItem} />
    </div>
  );
}

function FusionSection({
  title,
  icon: Icon,
  items,
  onOpen,
  onDelete,
}: {
  title: string;
  icon: any;
  items: FusionItem[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
        <Icon className="h-4 w-4" /> {title}
      </div>
      {items.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-stone-500 dark:border-stone-700 dark:text-stone-400">{item.type}</span>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest', item.status === 'Ready' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : item.status === 'Completed' ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300')}>{item.status}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-stone-900 dark:text-stone-100">{item.title}</h3>
                </div>
                <button onClick={() => onDelete(item.id)} className="text-xs text-stone-400 hover:text-red-600">Delete</button>
              </div>
              <p className="text-sm text-stone-600 dark:text-stone-300">{item.summary || 'No summary yet.'}</p>
              <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50 p-3 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Conclusion</div>
                <div>{item.centralConclusion || 'No final conclusion yet.'}</div>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                <span>{item.linkedNoteIds.length} notes · {item.linkedIdeaIds.length} ideas · {item.linkedGoalIds.length} goals · {item.linkedProjectIds.length} projects</span>
                <span>{item.shareReadiness}% ready</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full bg-stone-900 dark:bg-stone-100" style={{ width: `${item.shareReadiness}%` }} />
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs text-stone-400">Updated {new Date(item.updatedAt).toLocaleString()}</div>
                <button onClick={() => onOpen(item.id)} className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950">
                  <FileText className="h-4 w-4" /> Open
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
          No items in {title.toLowerCase()}.
        </div>
      )}
    </section>
  );
}
