import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileText, Link2, Minus, Plus, Sparkles, GripVertical, Columns2, Columns3, Heading1, Heading2, Heading3, Loader2 } from 'lucide-react';
import { generateFusionArtifact } from '../lib/ai';
import { useAppStore, type FusionAudience, type FusionStatus, type FusionType, type FusionSuggestion } from '../store';
import { cn } from '../lib/utils';
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
            onClick={() => navigate('/fusion')}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 cursor-pointer"
          >
            Save & Close
          </button>
        </div>
      </div>

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
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const insertTextAtCursor = (textarea: HTMLTextAreaElement, textToInsert: string, replaceSlash = false) => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;

    const actualStart = replaceSlash ? Math.max(0, start - 1) : start;
    const nextVal = currentVal.substring(0, actualStart) + textToInsert + currentVal.substring(end);
    onChange(nextVal);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = actualStart + textToInsert.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const menuItems = useMemo(() => [
    {
      id: 'ai',
      label: 'Generate with AI',
      description: 'Generate contents using vault signals',
      icon: Sparkles,
      action: (textarea: HTMLTextAreaElement) => {
        if (canGenerate) onAiGenerate();
      },
      disabled: !canGenerate || isGenerating,
    },
    {
      id: '2cols',
      label: '2 Columns Layout',
      description: 'Insert a side-by-side grid snippet',
      icon: Columns2,
      action: (textarea: HTMLTextAreaElement) => {
        const snippet = `\n<div class="grid grid-cols-1 md:grid-cols-2 gap-4">\n  <div>\n    <h4>Column 1</h4>\n    <p>Content...</p>\n  </div>\n  <div>\n    <h4>Column 2</h4>\n    <p>Content...</p>\n  </div>\n</div>\n`;
        insertTextAtCursor(textarea, snippet, true);
      },
      disabled: false,
    },
    {
      id: '3cols',
      label: '3 Columns Layout',
      description: 'Insert a three-column grid snippet',
      icon: Columns3,
      action: (textarea: HTMLTextAreaElement) => {
        const snippet = `\n<div class="grid grid-cols-1 md:grid-cols-3 gap-4">\n  <div>\n    <h4>Column 1</h4>\n    <p>Content...</p>\n  </div>\n  <div>\n    <h4>Column 2</h4>\n    <p>Content...</p>\n  </div>\n  <div>\n    <h4>Column 3</h4>\n    <p>Content...</p>\n  </div>\n</div>\n`;
        insertTextAtCursor(textarea, snippet, true);
      },
      disabled: false,
    },
    {
      id: 'h1',
      label: 'Heading 1',
      description: 'Large section heading',
      icon: Heading1,
      action: (textarea: HTMLTextAreaElement) => insertTextAtCursor(textarea, '\n# ', true),
      disabled: false,
    },
    {
      id: 'h2',
      label: 'Heading 2',
      description: 'Medium section heading',
      icon: Heading2,
      action: (textarea: HTMLTextAreaElement) => insertTextAtCursor(textarea, '\n## ', true),
      disabled: false,
    },
    {
      id: 'h3',
      label: 'Heading 3',
      description: 'Small section heading',
      icon: Heading3,
      action: (textarea: HTMLTextAreaElement) => insertTextAtCursor(textarea, '\n### ', true),
      disabled: false,
    },
    {
      id: 'divider',
      label: 'Divider',
      description: 'Horizontal line divider',
      icon: Minus,
      action: (textarea: HTMLTextAreaElement) => insertTextAtCursor(textarea, '\n---\n', true),
      disabled: false,
    },
  ], [canGenerate, isGenerating, onAiGenerate]);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    onChange(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.substring(0, selectionStart);

    if (textBeforeCursor.endsWith('/')) {
      const { caret } = getCaretCoordinates(e.target, selectionStart);
      setDropdownPosition({
        top: e.target.offsetTop + caret.top + 20,
        left: Math.min(e.target.offsetLeft + caret.left, e.target.clientWidth - 220),
      });
      setShowDropdown(true);
      setSelectedIndex(0);
    } else {
      setShowDropdown(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % menuItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + menuItems.length) % menuItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = menuItems[selectedIndex];
      if (selected && !selected.disabled && textareaRef.current) {
        selected.action(textareaRef.current);
      }
      setShowDropdown(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      textareaRef.current?.focus();
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
    <div ref={containerRef} className="relative group py-4 animate-fade-in">
      <button
        type="button"
        onClick={(e) => {
          setDropdownPosition({ top: 28, left: -24 });
          setShowDropdown(!showDropdown);
          setSelectedIndex(0);
        }}
        className="absolute -left-7 top-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center h-6 w-5 text-stone-400 hover:text-stone-700 dark:text-stone-600 dark:hover:text-stone-300 rounded cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-850"
        title="Block Actions"
      >
        <GripVertical className="h-4 w-4" />
      </button>

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

      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-y bg-transparent py-1 text-sm text-stone-800 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-600 outline-none leading-relaxed"
      />

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
                    if (textareaRef.current) menuItem.action(textareaRef.current);
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
