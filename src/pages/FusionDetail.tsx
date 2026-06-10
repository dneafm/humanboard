import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Link2 } from 'lucide-react';
import { useAppStore, type FusionAudience, type FusionStatus, type FusionType } from '../store';

const fusionTypes: FusionType[] = ['Post', 'Writing', 'Thesis', 'Report'];
const fusionStatuses: FusionStatus[] = ['Draft', 'Synthesizing', 'Ready', 'Completed'];
const fusionAudiences: FusionAudience[] = ['Personal', 'Team', 'Public', 'Client'];

export default function FusionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fusionItems, notes, ideas, goals, projects, updateFusionItem } = useAppStore();
  const item = fusionItems.find((fusion) => fusion.id === id);

  const linkedNotes = useMemo(() => notes.filter((note) => item?.linkedNoteIds.includes(note.id)), [item?.linkedNoteIds, notes]);
  const linkedIdeas = useMemo(() => ideas.filter((idea) => item?.linkedIdeaIds.includes(idea.id)), [ideas, item?.linkedIdeaIds]);
  const linkedGoals = useMemo(() => goals.filter((goal) => item?.linkedGoalIds.includes(goal.id)), [goals, item?.linkedGoalIds]);
  const linkedProjects = useMemo(() => projects.filter((project) => item?.linkedProjectIds.includes(project.id)), [item?.linkedProjectIds, projects]);

  if (!item) {
    return <div className="p-8 text-stone-500">Fusion item not found.</div>;
  }

  return (
    <div className="max-w-7xl mx-auto w-full p-8">
      <button onClick={() => navigate('/fusion')} className="mb-6 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
        <ArrowLeft className="h-4 w-4" /> Back to Fusion
      </button>

      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-4">
          <input
            value={item.title}
            onChange={(event) => updateFusionItem(item.id, { title: event.target.value })}
            className="w-full bg-transparent text-3xl font-semibold tracking-tight text-stone-900 outline-none dark:text-stone-100"
          />
          <div className="grid gap-3 md:grid-cols-4">
            <select value={item.type} onChange={(event) => updateFusionItem(item.id, { type: event.target.value as FusionType })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">
              {fusionTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select value={item.status} onChange={(event) => updateFusionItem(item.id, { status: event.target.value as FusionStatus })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">
              {fusionStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select value={item.audience} onChange={(event) => updateFusionItem(item.id, { audience: event.target.value as FusionAudience })} className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">
              {fusionAudiences.map((audience) => <option key={audience} value={audience}>{audience}</option>)}
            </select>
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200">
              {item.shareReadiness}% ready
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="space-y-6">
          <EditorCard title="Summary" icon={FileText}>
            <textarea value={item.summary} onChange={(event) => updateFusionItem(item.id, { summary: event.target.value })} placeholder="Short abstract or summary..." rows={4} className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-700 dark:focus:ring-stone-900" />
          </EditorCard>

          <EditorCard title="Final conclusion" icon={CheckCircle2}>
            <textarea value={item.centralConclusion} onChange={(event) => updateFusionItem(item.id, { centralConclusion: event.target.value })} placeholder="What is the conclusion worth sharing?" rows={4} className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-700 dark:focus:ring-stone-900" />
          </EditorCard>

          <EditorCard title="Body" icon={FileText}>
            <textarea value={item.body} onChange={(event) => updateFusionItem(item.id, { body: event.target.value })} placeholder="Write the full post, writing, thesis, or report..." rows={18} className="w-full resize-y rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-700 dark:focus:ring-stone-900" />
          </EditorCard>
        </div>

        <div className="space-y-6">
          <EditorCard title="Source material" icon={Link2}>
            <LinkedSection label="Notes" items={linkedNotes.map((note) => note.content)} empty="No linked notes" />
            <LinkedSection label="Ideas" items={linkedIdeas.map((idea) => idea.title)} empty="No linked ideas" />
            <LinkedSection label="Goals" items={linkedGoals.map((goal) => goal.title)} empty="No linked goals" />
            <LinkedSection label="Projects" items={linkedProjects.map((project) => project.title)} empty="No linked projects" />
          </EditorCard>

          <EditorCard title="Share readiness" icon={CheckCircle2}>
            <ChecklistItem label="Title" checked={item.checklist.title} />
            <ChecklistItem label="Summary" checked={item.checklist.summary} />
            <ChecklistItem label="Final conclusion" checked={item.checklist.centralConclusion} />
            <ChecklistItem label="Supporting links" checked={item.checklist.supportingLinks} />
            <ChecklistItem label="Body" checked={item.checklist.body} />
            <ChecklistItem label="Audience" checked={item.checklist.audience} />
          </EditorCard>

          <EditorCard title="Metadata" icon={FileText}>
            <div className="space-y-2 text-sm text-stone-600 dark:text-stone-300">
              <div>Created: {new Date(item.createdAt).toLocaleString()}</div>
              <div>Updated: {new Date(item.updatedAt).toLocaleString()}</div>
              <div>Completed: {item.completedAt ? new Date(item.completedAt).toLocaleString() : 'Not completed'}</div>
            </div>
          </EditorCard>
        </div>
      </div>
    </div>
  );
}

function EditorCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
        <Icon className="h-4 w-4" /> {title}
      </div>
      {children}
    </section>
  );
}

function LinkedSection({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">{label}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => <span key={`${label}-${item}`} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">{item}</span>)}
        </div>
      ) : (
        <div className="text-sm text-stone-400">{empty}</div>
      )}
    </div>
  );
}

function ChecklistItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
      <span>{label}</span>
      <span>{checked ? '✓' : '○'}</span>
    </div>
  );
}
