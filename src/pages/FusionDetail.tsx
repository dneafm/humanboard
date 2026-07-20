import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Link2, Minus, Plus, Sparkles, GripVertical, Columns2, Columns3, Heading1, Heading2, Heading3, Loader2, Trash2, Globe, ArrowUpRight } from 'lucide-react';
import { generateFusionArtifact } from '../lib/ai';
import { useAppStore, type FusionAudience, type FusionStatus, type FusionType, type FusionSuggestion } from '../store';
import { useAuthStore } from '../stores/authStore';
import { cn } from '../lib/utils';
import { FusionTextEditPopover } from '../components/FusionTextEditPopover';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';

const fusionTypes: FusionType[] = ['Post', 'Writing', 'Thesis', 'Report'];
const fusionStatuses: FusionStatus[] = ['Draft', 'Synthesizing', 'Ready', 'Completed'];
const fusionAudiences: FusionAudience[] = ['Personal', 'Team', 'Public', 'Client'];

export default function FusionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fusionItems, notes, ideas, goals, projects, updateFusionItem } = useAppStore();
  const item = fusionItems.find((fusion) => fusion.id === id);

  const [noteQuery, setNoteQuery] = useState('');
  const [ideaQuery, setIdeaQuery] = useState('');
  const [goalQuery, setGoalQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [showNotePicker, setShowNotePicker] = useState(false);
  const [showIdeaPicker, setShowIdeaPicker] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState<'summary' | 'conclusion' | 'full' | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [isSharePanelOpen, setIsSharePanelOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { user } = useAuthStore();
  const defaultAuthorName = user?.displayName || 'HumanBoard Creator';
  const publicLink = window.location.origin + '/shared/fusion/' + item.id;

  const linkedNotes = useMemo(() => notes.filter((note) => item?.linkedNoteIds.includes(note.id)), [item?.linkedNoteIds, notes]);
  const linkedIdeas = useMemo(() => ideas.filter((idea) => item?.linkedIdeaIds.includes(idea.id)), [ideas, item?.linkedIdeaIds]);
  const linkedGoals = useMemo(() => goals.filter((goal) => item?.linkedGoalIds.includes(goal.id)), [goals, item?.linkedGoalIds]);
  const linkedProjects = useMemo(() => projects.filter((project) => item?.linkedProjectIds.includes(project.id)), [item?.linkedProjectIds, projects]);

  const availableNotes = useMemo(() => notes.filter((note) => !(item?.linkedNoteIds ?? []).includes(note.id) && note.content.toLowerCase().includes(noteQuery.trim().toLowerCase())), [item?.linkedNoteIds, noteQuery, notes]);
  const availableIdeas = useMemo(() => ideas.filter((idea) => !(item?.linkedIdeaIds ?? []).includes(idea.id) && idea.title.toLowerCase().includes(ideaQuery.trim().toLowerCase())), [ideaQuery, ideas, item?.linkedIdeaIds]);
  const availableGoals = useMemo(() => goals.filter((goal) => !(item?.linkedGoalIds ?? []).includes(goal.id) && goal.title.toLowerCase().includes(goalQuery.trim().toLowerCase())), [goalQuery, goals, item?.linkedGoalIds]);
  const availableProjects = useMemo(() => projects.filter((project) => !(item?.linkedProjectIds ?? []).includes(project.id) && project.title.toLowerCase().includes(projectQuery.trim().toLowerCase())), [item?.linkedProjectIds, projectQuery, projects]);

  if (!item) {
    return <div className="p-8 text-stone-500">Fusion item not found.</div>;
  }

  const canGenerate = linkedNotes.length > 0 || linkedIdeas.length > 0;

  const toggleLinkedId = (field: 'linkedNoteIds' | 'linkedIdeaIds' | 'linkedGoalIds' | 'linkedProjectIds', value: string) => {
    const current = item[field] ?? [];
    const next = current.includes(value) ? current.filter((id) => id !== value) : [...current, value];
    updateFusionItem(item.id, { [field]: next });
  };

  const handleGenerate = async (mode: 'summary' | 'conclusion' | 'full') => {
    if (!canGenerate) return;
    setUiError(null);
    setIsGenerating(mode);
    try {
      const generated = await generateFusionArtifact({
        title: item.title,
        type: item.type,
        notes: linkedNotes.map((note) => note.content),
        ideas: linkedIdeas.map((idea) => ({ title: idea.title, summary: idea.summary, content: idea.content })),
        existingSummary: item.summary,
        existingConclusion: item.centralConclusion,
        existingBody: item.body,
        mode,
      });

      if (mode === 'summary') {
        updateFusionItem(item.id, { summary: generated.summary || item.summary });
      } else if (mode === 'conclusion') {
        updateFusionItem(item.id, { centralConclusion: generated.centralConclusion || item.centralConclusion });
      } else {
        updateFusionItem(item.id, {
          summary: generated.summary || item.summary,
          centralConclusion: generated.centralConclusion || item.centralConclusion,
          body: generated.body || item.body,
        });
      }
    } catch (error) {
      console.error('Fusion generation failed:', error);
      const detail = error instanceof Error ? error.message : 'AI generation failed.';
      setUiError(`Fusion AI generation failed. ${detail}`);
    } finally {
      setIsGenerating(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full p-8" data-fusion-id={item.id}>
      <FusionTextEditPopover />
      <button onClick={() => navigate('/fusion')} className="mb-6 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100">
        <ArrowLeft className="h-4 w-4" /> Back to Fusion
      </button>

      <div className="mb-8 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-1 space-y-4">
          <input
            value={item.title}
            onChange={(event) => updateFusionItem(item.id, { title: event.target.value })}
            data-fusion-field="title"
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

        <div className="flex flex-wrap gap-2 lg:self-end">
          {item.status === 'Draft' || item.status === 'Synthesizing' ? (
            <button
              type="button"
              onClick={() => updateFusionItem(item.id, { status: 'Ready' })}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-850 cursor-pointer"
            >
              Mark Ready to Share
            </button>
          ) : item.status === 'Ready' ? (
            <button
              type="button"
              onClick={() => updateFusionItem(item.id, { status: 'Completed', completedAt: new Date().toISOString() })}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 dark:bg-emerald-750 dark:hover:bg-emerald-850 cursor-pointer"
            >
              Complete Fusion
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setIsSharePanelOpen(!isSharePanelOpen)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition cursor-pointer",
              item.isPublic
                ? "border-emerald-250 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-850"
            )}
          >
            <Globe className="h-4 w-4" />
            {item.isPublic ? 'Public' : 'Publish'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/fusion')}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>

      {isSharePanelOpen && (
        <div className="mb-6 p-6 rounded-3xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900/40 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold text-stone-900 dark:text-stone-100">Publish to Web</h4>
              <p className="text-xs text-stone-500 dark:text-stone-500 mt-1">Make this fusion readable by anyone like a Substack post.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">Public Access</span>
              <button
                type="button"
                onClick={() => {
                  const nextPublic = !item.isPublic;
                  updateFusionItem(item.id, { 
                    isPublic: nextPublic,
                    authorName: item.authorName || defaultAuthorName
                  });
                }}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  item.isPublic ? "bg-emerald-600" : "bg-stone-200 dark:bg-stone-800"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    item.isPublic ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>
          </div>

          {item.isPublic && (
            <div className="pt-5 border-t border-stone-100 dark:border-stone-850 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Author Name</label>
                  <input
                    type="text"
                    placeholder="Enter author name..."
                    value={item.authorName || ''}
                    onChange={(e) => updateFusionItem(item.id, { authorName: e.target.value })}
                    data-fusion-field="authorName"
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 rounded-xl px-3.5 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500 mb-2">Author Bio / Profile</label>
                  <input
                    type="text"
                    placeholder="E.g., Tech researcher and strategic builder..."
                    value={item.authorBio || ''}
                    onChange={(e) => updateFusionItem(item.id, { authorBio: e.target.value })}
                    data-fusion-field="authorBio"
                    className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-850 rounded-xl px-3.5 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 transition-colors"
                  />
                </div>
              </div>

              <div className="bg-stone-50 dark:bg-stone-950 p-4 rounded-2xl border border-stone-200/50 dark:border-stone-850/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1">Public Shareable Link</div>
                  <div className="text-xs text-stone-600 dark:text-stone-400 truncate select-all">{publicLink}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(publicLink);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="bg-white hover:bg-stone-50 dark:bg-stone-900 dark:hover:bg-stone-850 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-800 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <a
                    href={`/shared/fusion/${item.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-stone-900 hover:bg-stone-800 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-950 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-sm transition flex items-center gap-1 active:scale-95 cursor-pointer"
                  >
                    View Page <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {uiError && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {uiError}
        </div>
      )}

      {!canGenerate && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 px-5 py-4 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          💡 <strong>AI Generation Disabled</strong>: Link notes or ideas in the <strong>Source material</strong> panel on the right to enable AI-powered synthesis.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_360px]">
        <div className="flex flex-col gap-6 pl-10 pr-2">
          {/* Edit/Preview Tabs */}
          <div className="flex items-center gap-2 border-b border-stone-200/60 dark:border-stone-800/60 pb-3 mb-2">
            <button
              type="button"
              onClick={() => setActiveTab('edit')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                activeTab === 'edit'
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm"
                  : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              )}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={cn(
                "px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer",
                activeTab === 'preview'
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm"
                  : "text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              )}
            >
              Preview
            </button>
          </div>

          {activeTab === 'edit' ? (
            <div className="space-y-6">
              <NotionBlockEditor
                title="Summary"
                value={item.summary}
                onChange={(val) => updateFusionItem(item.id, { summary: val })}
                fusionFieldPath="summary"
                placeholder="Short abstract or summary..."
                rows={4}
                onAiGenerate={() => handleGenerate('summary')}
                isGenerating={isGenerating === 'summary'}
                canGenerate={canGenerate}
                aiLabel="AI Generate summary"
              />

              <NotionBlockEditor
                title="Final conclusion"
                value={item.centralConclusion}
                onChange={(val) => updateFusionItem(item.id, { centralConclusion: val })}
                fusionFieldPath="centralConclusion"
                placeholder="What is the conclusion worth sharing?"
                rows={4}
                onAiGenerate={() => handleGenerate('conclusion')}
                isGenerating={isGenerating === 'conclusion'}
                canGenerate={canGenerate}
                aiLabel="AI Generate conclusion"
              />

              <NotionBlockEditor
                title="Body"
                value={item.body}
                onChange={(val) => updateFusionItem(item.id, { body: val })}
                fusionFieldPath="body"
                placeholder="Write the full post, writing, thesis, or report..."
                rows={18}
                onAiGenerate={() => handleGenerate('full')}
                isGenerating={isGenerating === 'full'}
                canGenerate={canGenerate}
                aiLabel="AI Generate draft"
              />
            </div>
          ) : (
            <div className="prose prose-stone dark:prose-invert max-w-none space-y-8 py-2">
              {item.summary && (
                <div className="pl-4 border-l-2 border-stone-300 dark:border-stone-700 italic text-stone-600 dark:text-stone-400 text-base leading-relaxed">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {item.summary}
                  </ReactMarkdown>
                </div>
              )}

              {item.centralConclusion && (
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/10">
                  <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1.5">Central Takeaway</div>
                  <div className="text-stone-850 dark:text-stone-150 font-medium text-base leading-relaxed">
                    <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                      {item.centralConclusion}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {item.body ? (
                <div className="text-stone-800 dark:text-stone-200 leading-relaxed text-sm space-y-4">
                  <ReactMarkdown rehypePlugins={[rehypeRaw]}>
                    {item.body}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-stone-400 dark:text-stone-600 italic text-sm">No body content written yet. Use Edit mode to write or generate context.</div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <EditorCard title="Source material" icon={Link2}>
            <LinkManager
              label="Notes"
              linkedItems={linkedNotes.map((note) => ({ id: note.id, label: note.content.slice(0, 80) }))}
              availableItems={availableNotes.map((note) => ({ id: note.id, label: note.content.slice(0, 80) }))}
              query={noteQuery}
              setQuery={setNoteQuery}
              showPicker={showNotePicker}
              setShowPicker={setShowNotePicker}
              emptyLinked="No linked notes"
              emptyAvailable="No matching notes"
              onToggle={(value) => toggleLinkedId('linkedNoteIds', value)}
            />
            <LinkManager
              label="Ideas"
              linkedItems={linkedIdeas.map((idea) => ({ id: idea.id, label: idea.title }))}
              availableItems={availableIdeas.map((idea) => ({ id: idea.id, label: idea.title }))}
              query={ideaQuery}
              setQuery={setIdeaQuery}
              showPicker={showIdeaPicker}
              setShowPicker={setShowIdeaPicker}
              emptyLinked="No linked ideas"
              emptyAvailable="No matching ideas"
              onToggle={(value) => toggleLinkedId('linkedIdeaIds', value)}
            />
            <LinkManager
              label="Goals"
              linkedItems={linkedGoals.map((goal) => ({ id: goal.id, label: goal.title }))}
              availableItems={availableGoals.map((goal) => ({ id: goal.id, label: goal.title }))}
              query={goalQuery}
              setQuery={setGoalQuery}
              showPicker={showGoalPicker}
              setShowPicker={setShowGoalPicker}
              emptyLinked="No linked goals"
              emptyAvailable="No matching goals"
              onToggle={(value) => toggleLinkedId('linkedGoalIds', value)}
            />
            <LinkManager
              label="Projects"
              linkedItems={linkedProjects.map((project) => ({ id: project.id, label: project.title }))}
              availableItems={availableProjects.map((project) => ({ id: project.id, label: project.title }))}
              query={projectQuery}
              setQuery={setProjectQuery}
              showPicker={showProjectPicker}
              setShowPicker={setShowProjectPicker}
              emptyLinked="No linked projects"
              emptyAvailable="No matching projects"
              onToggle={(value) => toggleLinkedId('linkedProjectIds', value)}
            />
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

function LinkManager({
  label,
  linkedItems,
  availableItems,
  query,
  setQuery,
  showPicker,
  setShowPicker,
  emptyLinked,
  emptyAvailable,
  onToggle,
}: {
  label: string;
  linkedItems: Array<{ id: string; label: string }>;
  availableItems: Array<{ id: string; label: string }>;
  query: string;
  setQuery: (value: string) => void;
  showPicker: boolean;
  setShowPicker: (value: boolean) => void;
  emptyLinked: string;
  emptyAvailable: string;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-widest text-stone-400">{label}</div>
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
        >
          {showPicker ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {showPicker ? 'Hide' : 'Add'}
        </button>
      </div>

      {linkedItems.length ? (
        <div className="flex flex-wrap gap-2">
          {linkedItems.map((item) => (
            <button key={item.id} type="button" onClick={() => onToggle(item.id)} className="rounded-full border border-stone-900 bg-stone-900 px-3 py-1 text-xs text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950">
              {item.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="text-sm text-stone-400">{emptyLinked}</div>
      )}

      {showPicker && (
        <>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="mt-3 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-700 dark:focus:ring-stone-900"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {availableItems.length ? availableItems.map((item) => (
              <button key={item.id} type="button" onClick={() => onToggle(item.id)} className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
                {item.label}
              </button>
            )) : <div className="text-sm text-stone-400">{emptyAvailable}</div>}
          </div>
        </>
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

function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);

  const properties = [
    'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderWidth', 'borderStyle', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust',
    'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration',
    'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordBreak = 'break-all';

  properties.forEach((prop) => {
    if (style[prop as any]) {
      div.style[prop as any] = style[prop as any];
    }
  });

  div.textContent = element.value.substring(0, position);
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);

  document.body.appendChild(div);
  const caret = {
    top: span.offsetTop - element.scrollTop,
    left: span.offsetLeft - element.scrollLeft,
  };
  document.body.removeChild(div);

  return { caret };
}

interface Block {
  id: string;
  type: 'text' | 'h1' | 'h2' | 'h3' | 'divider' | 'columns2' | 'columns3';
  content: string;
  columns?: string[];
}

function serializeBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'h1':
          return `# ${block.content}`;
        case 'h2':
          return `## ${block.content}`;
        case 'h3':
          return `### ${block.content}`;
        case 'divider':
          return `---`;
        case 'columns2':
          return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">\n  <div>\n    ${(block.columns?.[0] || '').trim()}\n  </div>\n  <div>\n    ${(block.columns?.[1] || '').trim()}\n  </div>\n</div>`;
        case 'columns3':
          return `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">\n  <div>\n    ${(block.columns?.[0] || '').trim()}\n  </div>\n  <div>\n    ${(block.columns?.[1] || '').trim()}\n  </div>\n  <div>\n    ${(block.columns?.[2] || '').trim()}\n  </div>\n</div>`;
        default:
          return block.content;
      }
    })
    .join('\n\n');
}

function deserializeBlocks(text: string): Block[] {
  if (!text) {
    return [{ id: Math.random().toString(), type: 'text', content: '' }];
  }

  const tempCol2: string[][] = [];
  const tempCol3: string[][] = [];

  // Match 3 columns layout
  let workingText = text.replace(/<div class="grid grid-cols-1 md:grid-cols-3 gap-4">([\s\S]*?)<\/div>/gi, (match) => {
    const divs: string[] = [];
    const divRegex = /<div>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = divRegex.exec(match)) !== null) {
      divs.push(m[1].trim());
    }
    while (divs.length < 3) divs.push('');
    tempCol3.push(divs.slice(0, 3));
    return `\n\n[[BLOCK_COL3_${tempCol3.length - 1}]]\n\n`;
  });

  // Match 2 columns layout
  workingText = workingText.replace(/<div class="grid grid-cols-1 md:grid-cols-2 gap-4">([\s\S]*?)<\/div>/gi, (match) => {
    const divs: string[] = [];
    const divRegex = /<div>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = divRegex.exec(match)) !== null) {
      divs.push(m[1].trim());
    }
    while (divs.length < 2) divs.push('');
    tempCol2.push(divs.slice(0, 2));
    return `\n\n[[BLOCK_COL2_${tempCol2.length - 1}]]\n\n`;
  });

  const lines = workingText.split('\n');
  const blocks: Block[] = [];
  let currentTextBlockContent: string[] = [];

  const flushTextBlock = () => {
    if (currentTextBlockContent.length > 0) {
      const content = currentTextBlockContent.join('\n').trim();
      if (content || blocks.length === 0) {
        blocks.push({
          id: Math.random().toString(),
          type: 'text',
          content,
        });
      }
      currentTextBlockContent = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    const col3Match = /^\[\[BLOCK_COL3_(\d+)\]\]$/.exec(line);
    if (col3Match) {
      flushTextBlock();
      const index = parseInt(col3Match[1]);
      blocks.push({
        id: Math.random().toString(),
        type: 'columns3',
        content: '',
        columns: tempCol3[index] || ['', '', ''],
      });
      continue;
    }

    const col2Match = /^\[\[BLOCK_COL2_(\d+)\]\]$/.exec(line);
    if (col2Match) {
      flushTextBlock();
      const index = parseInt(col2Match[1]);
      blocks.push({
        id: Math.random().toString(),
        type: 'columns2',
        content: '',
        columns: tempCol2[index] || ['', ''],
      });
      continue;
    }

    if (line === '---' || line === '***' || line === '___') {
      flushTextBlock();
      blocks.push({
        id: Math.random().toString(),
        type: 'divider',
        content: '',
      });
      continue;
    }

    if (line.startsWith('# ')) {
      flushTextBlock();
      blocks.push({
        id: Math.random().toString(),
        type: 'h1',
        content: line.substring(2).trim(),
      });
      continue;
    }

    if (line.startsWith('## ')) {
      flushTextBlock();
      blocks.push({
        id: Math.random().toString(),
        type: 'h2',
        content: line.substring(3).trim(),
      });
      continue;
    }

    if (line.startsWith('### ')) {
      flushTextBlock();
      blocks.push({
        id: Math.random().toString(),
        type: 'h3',
        content: line.substring(4).trim(),
      });
      continue;
    }

    if (lines[i].trim() === '') {
      if (currentTextBlockContent.length > 0 && currentTextBlockContent[currentTextBlockContent.length - 1] === '') {
        flushTextBlock();
      } else {
        currentTextBlockContent.push('');
      }
    } else {
      currentTextBlockContent.push(lines[i]);
    }
  }

  flushTextBlock();

  if (blocks.length === 0) {
    blocks.push({ id: Math.random().toString(), type: 'text', content: '' });
  }

  return blocks;
}

function NotionBlockEditor({
  title,
  value,
  onChange,
  placeholder,
  rows = 4,
  onAiGenerate,
  isGenerating,
  canGenerate,
  aiLabel,
  fusionFieldPath,
}: {
  title: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  rows?: number;
  onAiGenerate: () => void;
  isGenerating: boolean;
  canGenerate: boolean;
  aiLabel: string;
  fusionFieldPath?: 'summary' | 'centralConclusion' | 'body';
}) {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeColIndex, setActiveColIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync state with parent value changes (e.g. from AI generation)
  useEffect(() => {
    const currentSerialized = serializeBlocks(blocks);
    if (value !== currentSerialized) {
      setBlocks(deserializeBlocks(value));
    }
  }, [value]);

  const updateBlockContent = (id: string, content: string) => {
    const next = blocks.map(b => b.id === id ? { ...b, content } : b);
    setBlocks(next);
    onChange(serializeBlocks(next));
  };

  const updateColumnContent = (id: string, colIndex: number, colContent: string) => {
    const next = blocks.map(b => {
      if (b.id === id) {
        const cols = [...(b.columns || ['', '', ''])];
        cols[colIndex] = colContent;
        return { ...b, columns: cols };
      }
      return b;
    });
    setBlocks(next);
    onChange(serializeBlocks(next));
  };

  const insertBlockBelow = (blockId: string, type: Block['type']) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;

    const newBlock: Block = {
      id: Math.random().toString(),
      type,
      content: '',
      columns: type === 'columns2' ? ['', ''] : type === 'columns3' ? ['', '', ''] : undefined,
    };

    const next = [...blocks];
    next.splice(index + 1, 0, newBlock);
    setBlocks(next);
    onChange(serializeBlocks(next));
  };

  const changeBlockType = (blockId: string, type: Block['type'], content: string) => {
    const next = blocks.map(b => b.id === blockId ? { ...b, type, content } : b);
    setBlocks(next);
    onChange(serializeBlocks(next));
  };

  const deleteBlock = (blockId: string) => {
    const next = blocks.filter(b => b.id !== blockId);
    setBlocks(next);
    onChange(serializeBlocks(next));
  };

  const menuItems = useMemo(() => [
    {
      id: 'ai',
      label: 'Generate with AI',
      description: 'Generate contents using vault signals',
      icon: Sparkles,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        if (colIndex !== undefined) {
          updateColumnContent(blockId, colIndex, cleanVal);
        } else {
          updateBlockContent(blockId, cleanVal);
        }

        if (canGenerate) onAiGenerate();
      },
      disabled: !canGenerate || isGenerating,
    },
    {
      id: '2cols',
      label: '2 Columns Layout',
      description: 'Insert a side-by-side grid template',
      icon: Columns2,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        if (colIndex !== undefined) {
          updateColumnContent(blockId, colIndex, cleanVal);
        } else {
          updateBlockContent(blockId, cleanVal);
        }

        insertBlockBelow(blockId, 'columns2');
      },
      disabled: false,
    },
    {
      id: '3cols',
      label: '3 Columns Layout',
      description: 'Insert a three-column grid template',
      icon: Columns3,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        if (colIndex !== undefined) {
          updateColumnContent(blockId, colIndex, cleanVal);
        } else {
          updateBlockContent(blockId, cleanVal);
        }

        insertBlockBelow(blockId, 'columns3');
      },
      disabled: false,
    },
    {
      id: 'h1',
      label: 'Heading 1',
      description: 'Large section heading',
      icon: Heading1,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        changeBlockType(blockId, 'h1', cleanVal);
      },
      disabled: false,
    },
    {
      id: 'h2',
      label: 'Heading 2',
      description: 'Medium section heading',
      icon: Heading2,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        changeBlockType(blockId, 'h2', cleanVal);
      },
      disabled: false,
    },
    {
      id: 'h3',
      label: 'Heading 3',
      description: 'Small section heading',
      icon: Heading3,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        changeBlockType(blockId, 'h3', cleanVal);
      },
      disabled: false,
    },
    {
      id: 'divider',
      label: 'Divider',
      description: 'Horizontal line divider',
      icon: Minus,
      action: (textarea: HTMLTextAreaElement, blockId: string, colIndex?: number) => {
        const start = textarea.selectionStart;
        const currentVal = textarea.value;
        const actualStart = Math.max(0, start - 1);
        const cleanVal = currentVal.substring(0, actualStart) + currentVal.substring(start);
        
        if (colIndex !== undefined) {
          updateColumnContent(blockId, colIndex, cleanVal);
        } else {
          updateBlockContent(blockId, cleanVal);
        }

        insertBlockBelow(blockId, 'divider');
      },
      disabled: false,
    },
    {
      id: 'delete',
      label: 'Delete Block',
      description: 'Remove this block from document',
      icon: Trash2,
      action: (textarea: HTMLTextAreaElement, blockId: string) => {
        deleteBlock(blockId);
      },
      disabled: blocks.length <= 1,
    },
  ], [canGenerate, isGenerating, onAiGenerate, blocks]);

  const handleBlockChange = (e: React.ChangeEvent<HTMLTextAreaElement>, blockId: string, colIndex?: number) => {
    const val = e.target.value;
    
    if (colIndex !== undefined) {
      updateColumnContent(blockId, colIndex, val);
    } else {
      updateBlockContent(blockId, val);
    }

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, selectionStart);

    if (textBeforeCursor.endsWith('/')) {
      const { caret } = getCaretCoordinates(e.target, selectionStart);
      const textareaRect = e.target.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      
      if (textareaRect && containerRect) {
        setDropdownPosition({
          top: (textareaRect.top - containerRect.top) + caret.top + 20,
          left: Math.min((textareaRect.left - containerRect.left) + caret.left, containerRect.width - 240),
        });
      }
      
      setActiveBlockId(blockId);
      setActiveColIndex(colIndex !== undefined ? colIndex : null);
      setShowDropdown(true);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, blockId: string, colIndex?: number) => {
    if (showDropdown && activeBlockId === blockId) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % menuItems.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = menuItems[selectedIndex];
        if (selected && !selected.disabled) {
          selected.action(e.currentTarget, blockId, colIndex);
        }
        setShowDropdown(false);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    if (e.key === 'Backspace') {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        if (block.type !== 'columns2' && block.type !== 'columns3' && block.content === '') {
          if (blocks.length > 1) {
            e.preventDefault();
            deleteBlock(blockId);
          }
        } else if ((block.type === 'columns2' || block.type === 'columns3') && colIndex !== undefined) {
          const isEmpty = (block.columns || []).every(c => c === '');
          if (isEmpty && blocks.length > 1) {
            e.preventDefault();
            deleteBlock(blockId);
          }
        }
      }
    }
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full space-y-4 py-2">
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          <span>{title}</span>
        </div>
        {isGenerating && (
          <span className="flex items-center gap-1 text-xs text-amber-500 font-medium">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>AI generating...</span>
          </span>
        )}
      </div>

      <div className="space-y-4">
        {blocks.map((block) => {
          return (
            <div key={block.id} className="relative group flex items-start gap-3 w-full pl-6">
              {/* Grip handle button visible on hover */}
              <div className="absolute left-0 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center h-6 w-5 text-stone-400 dark:text-stone-600">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBlockId(block.id);
                    // Open dropdown below the grip button
                    const el = containerRef.current;
                    const gripEl = document.getElementById(`grip-${block.id}`);
                    if (el && gripEl) {
                      const gripRect = gripEl.getBoundingClientRect();
                      const containerRect = el.getBoundingClientRect();
                      setDropdownPosition({
                        top: (gripRect.top - containerRect.top) + 24,
                        left: (gripRect.left - containerRect.left),
                      });
                    } else {
                      setDropdownPosition({ top: 30, left: 10 });
                    }
                    setShowDropdown(true);
                    setSelectedIndex(0);
                  }}
                  id={`grip-${block.id}`}
                  className="hover:text-stone-700 dark:hover:text-stone-300 rounded hover:bg-stone-155 dark:hover:bg-stone-850 cursor-pointer p-0.5"
                  title="Block Options"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>

              {/* Block Content Renderers */}
              <div className="w-full">
                {block.type === 'divider' ? (
                  <div className="w-full py-3 group/div relative">
                    <hr className="border-stone-200 dark:border-stone-800" />
                    <button
                      type="button"
                      onClick={() => deleteBlock(block.id)}
                      className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/div:opacity-100 transition-opacity text-[10px] text-red-500 hover:text-red-700 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : block.type === 'columns2' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full border border-dashed border-stone-200 dark:border-stone-800 rounded-xl p-3 bg-stone-50/30 dark:bg-stone-900/10">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400 dark:text-stone-500">Column 1</span>
                      <textarea
                        value={block.columns?.[0] || ''}
                        onChange={(e) => handleBlockChange(e, block.id, 0)}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, 0)}
                        placeholder="Column 1 content..."
                        rows={3}
                        className="w-full resize-y bg-transparent py-1 text-sm text-stone-850 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-750 outline-none leading-relaxed"
                      />
                    </div>
                    <div className="flex flex-col gap-1 border-t md:border-t-0 md:border-l border-dashed border-stone-200 dark:border-stone-800 pt-2 md:pt-0 md:pl-4">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400 dark:text-stone-500">Column 2</span>
                      <textarea
                        value={block.columns?.[1] || ''}
                        onChange={(e) => handleBlockChange(e, block.id, 1)}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, 1)}
                        placeholder="Column 2 content..."
                        rows={3}
                        className="w-full resize-y bg-transparent py-1 text-sm text-stone-850 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-750 outline-none leading-relaxed"
                      />
                    </div>
                  </div>
                ) : block.type === 'columns3' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full border border-dashed border-stone-200 dark:border-stone-800 rounded-xl p-3 bg-stone-50/30 dark:bg-stone-900/10">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400 dark:text-stone-500">Column 1</span>
                      <textarea
                        value={block.columns?.[0] || ''}
                        onChange={(e) => handleBlockChange(e, block.id, 0)}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, 0)}
                        placeholder="Column 1 content..."
                        rows={3}
                        className="w-full resize-y bg-transparent py-1 text-sm text-stone-850 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-750 outline-none leading-relaxed"
                      />
                    </div>
                    <div className="flex flex-col gap-1 border-t md:border-t-0 md:border-l border-dashed border-stone-200 dark:border-stone-800 pt-2 md:pt-0 md:pl-4">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400 dark:text-stone-500">Column 2</span>
                      <textarea
                        value={block.columns?.[1] || ''}
                        onChange={(e) => handleBlockChange(e, block.id, 1)}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, 1)}
                        placeholder="Column 2 content..."
                        rows={3}
                        className="w-full resize-y bg-transparent py-1 text-sm text-stone-850 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-750 outline-none leading-relaxed"
                      />
                    </div>
                    <div className="flex flex-col gap-1 border-t md:border-t-0 md:border-l border-dashed border-stone-200 dark:border-stone-800 pt-2 md:pt-0 md:pl-4">
                      <span className="text-[9px] uppercase tracking-wider font-semibold text-stone-400 dark:text-stone-500">Column 3</span>
                      <textarea
                        value={block.columns?.[2] || ''}
                        onChange={(e) => handleBlockChange(e, block.id, 2)}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, 2)}
                        placeholder="Column 3 content..."
                        rows={3}
                        className="w-full resize-y bg-transparent py-1 text-sm text-stone-850 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-750 outline-none leading-relaxed"
                      />
                    </div>
                  </div>
                ) : (
                  <textarea
                    value={block.content}
                    onChange={(e) => handleBlockChange(e, block.id)}
                    onKeyDown={(e) => handleBlockKeyDown(e, block.id)}
                    data-fusion-field={fusionFieldPath ?? 'body'}
                    placeholder={
                      block.type === 'h1'
                        ? 'Heading 1'
                        : block.type === 'h2'
                        ? 'Heading 2'
                        : block.type === 'h3'
                        ? 'Heading 3'
                        : placeholder
                    }
                    rows={block.type === 'text' ? rows : 1}
                    className={cn(
                      "w-full bg-transparent py-1 resize-y outline-none leading-relaxed transition-all duration-200 border-b border-transparent focus:border-stone-100 dark:focus:border-stone-800",
                      block.type === 'h1' && "text-2xl font-bold text-stone-900 dark:text-stone-100 tracking-tight",
                      block.type === 'h2' && "text-xl font-semibold text-stone-900 dark:text-stone-100 tracking-tight",
                      block.type === 'h3' && "text-lg font-medium text-stone-900 dark:text-stone-100 tracking-tight",
                      block.type === 'text' && "text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-650"
                    )}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showDropdown && dropdownPosition && (
        <div
          style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          className="absolute z-50 w-64 rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-stone-800 dark:bg-stone-950"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider border-b border-stone-100 dark:border-stone-900 mb-1">
            Actions & formatting
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {menuItems.map((menuItem, idx) => {
              const Icon = menuItem.icon;
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={menuItem.id}
                  type="button"
                  disabled={menuItem.disabled}
                  onClick={() => {
                    const blockId = activeBlockId;
                    const colIndex = activeColIndex !== null ? activeColIndex : undefined;
                    const fakeTextarea = document.createElement('textarea');
                    fakeTextarea.value = '/';
                    fakeTextarea.selectionStart = 1;
                    fakeTextarea.selectionEnd = 1;
                    if (blockId) {
                      menuItem.action(fakeTextarea, blockId, colIndex);
                    }
                    setShowDropdown(false);
                  }}
                  className={cn(
                    "w-full flex items-start gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors disabled:opacity-40 disabled:hover:bg-transparent",
                    isSelected
                      ? "bg-stone-100 dark:bg-stone-900 text-stone-900 dark:text-stone-100"
                      : "text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/40"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", isSelected ? "text-stone-950 dark:text-stone-50" : "text-stone-400 dark:text-stone-500")} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold">{menuItem.label}</div>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500 truncate mt-0.5">{menuItem.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
