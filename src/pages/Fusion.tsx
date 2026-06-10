import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Sparkles, CheckCircle2, PenSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { type FusionAudience, type FusionItem, type FusionStatus, type FusionType, useAppStore } from '../store';

const fusionTypes: FusionType[] = ['Post', 'Writing', 'Thesis', 'Report'];
const fusionStatuses: FusionStatus[] = ['Draft', 'Synthesizing', 'Ready', 'Completed'];
const fusionAudiences: FusionAudience[] = ['Personal', 'Team', 'Public', 'Client'];

export default function FusionPage() {
  const navigate = useNavigate();
  const { fusionItems, addFusionItem, deleteFusionItem } = useAppStore();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'All' | FusionType>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | FusionStatus>('All');
  const [audienceFilter, setAudienceFilter] = useState<'All' | FusionAudience>('All');
  const [sortBy, setSortBy] = useState<'updated' | 'readiness' | 'type'>('updated');

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

  const handleCreateFusion = () => {
    let nextId = '';
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
    nextId = latest?.id ?? '';
    if (nextId) navigate(`/fusion/${nextId}`);
  };

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
