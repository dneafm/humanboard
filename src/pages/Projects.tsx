import { useMemo, useState } from 'react';
import { type Project, type ProjectTask, type ProjectUpdateEntry, useAppStore } from '../store';
import { FolderKanban, Plus, FlaskConical, ArrowRight, Sparkles, Sprout, CircleDashed, X, Trash2, Pencil, CheckCircle2, PauseCircle, PlayCircle, NotebookPen, Target, AlertCircle, CalendarDays, Link2, ListTodo } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const ACTIVATION_THRESHOLD = 80;

function getReadinessMeta(maturity: number) {
  if (maturity >= ACTIVATION_THRESHOLD) {
    return {
      label: 'Ready to activate',
      tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      hint: 'Enough ingredients are in place to try a small, reversible first step.',
    };
  }

  if (maturity >= 50) {
    return {
      label: 'Incubating with momentum',
      tone: 'bg-amber-50 text-amber-700 border-amber-200',
      hint: 'Keep watching signals, collect proof, but do not force execution yet.',
    };
  }

  return {
    label: 'Early incubation',
    tone: 'bg-stone-100 text-stone-600 border-stone-200',
    hint: 'A live seed, not an obligation. Let it stay visible without pressure.',
  };
}

function ReadinessBar({ maturity }: { maturity: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 mb-2">
        <span>Readiness</span>
        <span>{maturity}%</span>
      </div>
      <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full bg-stone-900 transition-all duration-700" style={{ width: `${maturity}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-stone-400 uppercase tracking-wider">
        <span>Incubate</span>
        <span>{ACTIVATION_THRESHOLD}% activate</span>
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  sourceIdea,
  linkedGoalTitles,
  linkedIdeaTitles,
  linkedNotePreviews,
  availableGoals,
  availableIdeas,
  availableNotes,
  onDelete,
  onEdit,
  onStatusChange,
  onSaveNextAction,
  onSaveDefinitionOfDone,
  onSaveDueDate,
  onAddUpdate,
  onAddTask,
  onToggleTask,
  onToggleGoalLink,
  onToggleIdeaLink,
  onToggleNoteLink,
}: {
  project: Project;
  sourceIdea?: any;
  linkedGoalTitles: string[];
  linkedIdeaTitles: string[];
  linkedNotePreviews: string[];
  availableGoals: Array<{ id: string; title: string }>;
  availableIdeas: Array<{ id: string; title: string }>;
  availableNotes: Array<{ id: string; content: string }>;
  onDelete: (projectId: string) => void;
  onEdit: (project: Project) => void;
  onStatusChange: (projectId: string, status: Project['status']) => void;
  onSaveNextAction: (projectId: string, nextAction: string) => void;
  onSaveDefinitionOfDone: (projectId: string, definitionOfDone: string) => void;
  onSaveDueDate: (projectId: string, dueDate: string) => void;
  onAddUpdate: (projectId: string, content: string) => void;
  onAddTask: (projectId: string, content: string) => void;
  onToggleTask: (projectId: string, taskId: string) => void;
  onToggleGoalLink: (projectId: string, goalId: string) => void;
  onToggleIdeaLink: (projectId: string, ideaId: string) => void;
  onToggleNoteLink: (projectId: string, noteId: string) => void;
}) {
  const [nextActionDraft, setNextActionDraft] = useState(project.nextAction || '');
  const [definitionOfDoneDraft, setDefinitionOfDoneDraft] = useState(project.definitionOfDone || '');
  const [dueDateDraft, setDueDateDraft] = useState(project.dueDate ? project.dueDate.slice(0, 10) : '');
  const [updateDraft, setUpdateDraft] = useState('');
  const [taskDraft, setTaskDraft] = useState('');
  const [goalQuery, setGoalQuery] = useState('');
  const [ideaQuery, setIdeaQuery] = useState('');
  const [noteQuery, setNoteQuery] = useState('');
  const recentUpdates = useMemo(() => project.updates.slice(0, 3), [project.updates]);
  const openTasks = useMemo(() => project.tasks.filter((task) => !task.completed), [project.tasks]);
  const completedTasks = useMemo(() => project.tasks.filter((task) => task.completed), [project.tasks]);
  const filteredGoals = useMemo(() => availableGoals.filter((goal) => goal.title.toLowerCase().includes(goalQuery.trim().toLowerCase())), [availableGoals, goalQuery]);
  const filteredIdeas = useMemo(() => availableIdeas.filter((idea) => idea.title.toLowerCase().includes(ideaQuery.trim().toLowerCase())), [availableIdeas, ideaQuery]);
  const filteredNotes = useMemo(() => availableNotes.filter((note) => note.content.toLowerCase().includes(noteQuery.trim().toLowerCase())), [availableNotes, noteQuery]);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100">{project.title}</h3>
            <span className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block',
              project.status === 'Active' ? 'bg-blue-50 text-blue-700' :
              project.status === 'Blocked' ? 'bg-red-50 text-red-700' :
              project.status === 'Completed' ? 'bg-green-50 text-green-700' :
              'bg-stone-100 text-stone-600'
            )}>
              {project.status}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDelete(project.id)}
          className="rounded-lg p-2 text-stone-400 transition hover:bg-red-50 hover:text-red-600 dark:text-stone-500 dark:hover:bg-red-950/40 dark:hover:text-red-300"
          aria-label={`Delete project ${project.title}`}
          title="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <p className="mb-6 text-sm text-stone-700 dark:text-stone-300">{project.description}</p>

      {sourceIdea && (
        <div className="mb-6 rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-500 dark:text-stone-400">Source Idea</div>
          <Link to={`/ideas/${sourceIdea.id}`} className="group flex items-center gap-1 text-sm font-medium text-stone-700 hover:text-blue-600 dark:text-stone-200 dark:hover:text-blue-400">
            {sourceIdea.title}
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onEdit(project)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950"
        >
          <Pencil className="h-4 w-4" />
          Edit
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onStatusChange(project.id, 'Active')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950"><PlayCircle className="h-4 w-4" />Active</button>
          <button type="button" onClick={() => onStatusChange(project.id, 'Paused')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950"><PauseCircle className="h-4 w-4" />Pause</button>
          <button type="button" onClick={() => onStatusChange(project.id, 'Blocked')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950"><AlertCircle className="h-4 w-4" />Blocked</button>
          <button type="button" onClick={() => onStatusChange(project.id, 'Completed')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-950"><CheckCircle2 className="h-4 w-4" />Done</button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <Target className="h-3 w-3" /> Next action
          </div>
          <textarea
            value={nextActionDraft}
            onChange={(event) => setNextActionDraft(event.target.value)}
            placeholder="What is the next concrete move?"
            rows={2}
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onSaveNextAction(project.id, nextActionDraft)}
              className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
            >
              Save next action
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <CalendarDays className="h-3 w-3" /> Timeline
          </div>
          <label className="block text-xs text-stone-500 dark:text-stone-400">Due date</label>
          <input
            type="date"
            value={dueDateDraft}
            onChange={(event) => setDueDateDraft(event.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
          />
          <div className="mt-2 flex justify-between text-[11px] text-stone-400">
            <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
            <span>Updated {new Date(project.lastUpdatedAt).toLocaleDateString()}</span>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onSaveDueDate(project.id, dueDateDraft)}
              className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
            >
              Save due date
            </button>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <CheckCircle2 className="h-3 w-3" /> Definition of done
        </div>
        <textarea
          value={definitionOfDoneDraft}
          onChange={(event) => setDefinitionOfDoneDraft(event.target.value)}
          placeholder="What does success look like for this project?"
          rows={3}
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onSaveDefinitionOfDone(project.id, definitionOfDoneDraft)}
            className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            Save done definition
          </button>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <ListTodo className="h-3 w-3" /> Task checklist
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={taskDraft}
            onChange={(event) => setTaskDraft(event.target.value)}
            placeholder="Add a task"
            className="flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
          />
          <button
            type="button"
            onClick={() => {
              onAddTask(project.id, taskDraft);
              setTaskDraft('');
            }}
            disabled={!taskDraft.trim()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            Add task
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {openTasks.map((task: ProjectTask) => (
            <label key={task.id} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
              <input type="checkbox" checked={task.completed} onChange={() => onToggleTask(project.id, task.id)} />
              <span>{task.content}</span>
            </label>
          ))}
          {completedTasks.map((task: ProjectTask) => (
            <label key={task.id} className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500">
              <input type="checkbox" checked={task.completed} onChange={() => onToggleTask(project.id, task.id)} />
              <span className="line-through">{task.content}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <Link2 className="h-3 w-3" /> Linked context
        </div>
        <div className="space-y-3 text-sm text-stone-700 dark:text-stone-300">
          <div>
            <div><span className="font-medium">Goals:</span> {linkedGoalTitles.length ? linkedGoalTitles.join(', ') : 'None linked yet'}</div>
            <input
              type="text"
              value={goalQuery}
              onChange={(event) => setGoalQuery(event.target.value)}
              placeholder="Search goals"
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {filteredGoals.map((goal) => {
                const linked = (project.linkedGoalIds ?? []).includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => onToggleGoalLink(project.id, goal.id)}
                    className={cn('rounded-full border px-3 py-1 text-xs', linked ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300')}
                  >
                    {goal.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div><span className="font-medium">Ideas:</span> {linkedIdeaTitles.length ? linkedIdeaTitles.join(', ') : 'None linked yet'}</div>
            <input
              type="text"
              value={ideaQuery}
              onChange={(event) => setIdeaQuery(event.target.value)}
              placeholder="Search ideas"
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {filteredIdeas.map((idea) => {
                const linked = (project.linkedIdeaIds ?? []).includes(idea.id);
                return (
                  <button
                    key={idea.id}
                    type="button"
                    onClick={() => onToggleIdeaLink(project.id, idea.id)}
                    className={cn('rounded-full border px-3 py-1 text-xs', linked ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300')}
                  >
                    {idea.title}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div><span className="font-medium">Notes:</span> {linkedNotePreviews.length ? linkedNotePreviews.join(' • ') : 'None linked yet'}</div>
            <input
              type="text"
              value={noteQuery}
              onChange={(event) => setNoteQuery(event.target.value)}
              placeholder="Search notes"
              className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {filteredNotes.map((note) => {
                const linked = (project.linkedNoteIds ?? []).includes(note.id);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onToggleNoteLink(project.id, note.id)}
                    className={cn('rounded-full border px-3 py-1 text-xs', linked ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300')}
                  >
                    {note.content.slice(0, 48)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-lg border border-stone-100 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          <NotebookPen className="h-3 w-3" /> Updates
        </div>
        <textarea
          value={updateDraft}
          onChange={(event) => setUpdateDraft(event.target.value)}
          placeholder="Log progress, blockers, or decisions..."
          rows={3}
          className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              onAddUpdate(project.id, updateDraft);
              setUpdateDraft('');
            }}
            disabled={!updateDraft.trim()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
          >
            Add update
          </button>
        </div>
        {recentUpdates.length > 0 && (
          <div className="mt-3 space-y-2">
            {recentUpdates.map((entry: ProjectUpdateEntry) => (
              <div key={entry.id} className="rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200">
                <div>{entry.content}</div>
                <div className="mt-2 text-[11px] text-stone-400">{new Date(entry.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {project.experiments.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <FlaskConical className="w-3 h-3" />
            Experiments
          </h4>
          <div className="space-y-2">
            {project.experiments.map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between rounded-md border border-stone-100 bg-white p-2 text-sm dark:border-stone-800 dark:bg-stone-950">
                <span className="text-stone-700 dark:text-stone-200">{exp.title}</span>
                <span className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider',
                  exp.status === 'Running' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  exp.status === 'Concluded' ? 'bg-stone-100 text-stone-500' :
                  'bg-stone-50 text-stone-400'
                )}>
                  {exp.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { projects, ideas, notes, goals, addProject, updateProject, deleteProject } = useAppStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  const linkedIdeaIds = new Set(projects.map((project) => project.sourceIdeaId));
  const projectIdeas = ideas.filter((idea) => idea.type === 'Project');
  const incubationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity < ACTIVATION_THRESHOLD);
  const activationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity >= ACTIVATION_THRESHOLD);

  const handleNewProject = () => {
    setEditingProjectId(null);
    setDraftTitle('');
    setDraftDescription('');
    setIsCreateOpen(true);
  };

  const handleEditProject = (project: Project) => {
    setEditingProjectId(project.id);
    setDraftTitle(project.title);
    setDraftDescription(project.description);
    setIsCreateOpen(true);
  };

  const handleCreateProject = () => {
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (!title) return;

    if (editingProjectId) {
      updateProject(editingProjectId, {
        title,
        description: description || 'Define the first concrete build, experiment, or execution step for this project.',
      });
    } else {
      addProject({
        title,
        description: description || 'Define the first concrete build, experiment, or execution step for this project.',
        sourceIdeaId: '',
        goalId: '',
        status: 'Active',
        nextAction: '',
        definitionOfDone: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        linkedNoteIds: [],
        linkedIdeaIds: [],
        linkedGoalIds: [],
        tasks: [],
        updates: [],
        experiments: [],
      });
    }

    setIsCreateOpen(false);
    setEditingProjectId(null);
    setDraftTitle('');
    setDraftDescription('');
  };

  const handleDeleteProject = (projectId: string) => {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    const confirmed = window.confirm(`Delete project "${target.title}"?`);
    if (!confirmed) return;
    deleteProject(projectId);
  };

  const handleProjectStatusChange = (projectId: string, status: Project['status']) => {
    updateProject(projectId, { status });
  };

  const handleProjectNextActionSave = (projectId: string, nextAction: string) => {
    updateProject(projectId, { nextAction: nextAction.trim() });
  };

  const handleProjectDefinitionOfDoneSave = (projectId: string, definitionOfDone: string) => {
    updateProject(projectId, { definitionOfDone: definitionOfDone.trim() });
  };

  const handleProjectDueDateSave = (projectId: string, dueDate: string) => {
    updateProject(projectId, { dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : '' });
  };

  const handleProjectAddTask = (projectId: string, content: string) => {
    const target = projects.find((project) => project.id === projectId);
    const value = content.trim();
    if (!target || !value) return;
    const nextTask: ProjectTask = {
      id: `${projectId}-task-${Date.now()}`,
      content: value,
      completed: false,
    };
    updateProject(projectId, { tasks: [...(target.tasks ?? []), nextTask] });
  };

  const handleProjectToggleTask = (projectId: string, taskId: string) => {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    updateProject(projectId, {
      tasks: (target.tasks ?? []).map((task) => task.id === taskId ? { ...task, completed: !task.completed } : task),
    });
  };

  const handleProjectAddUpdate = (projectId: string, content: string) => {
    const target = projects.find((project) => project.id === projectId);
    const value = content.trim();
    if (!target || !value) return;
    const nextEntry: ProjectUpdateEntry = {
      id: `${projectId}-${Date.now()}`,
      content: value,
      createdAt: new Date().toISOString(),
    };
    updateProject(projectId, { updates: [nextEntry, ...(target.updates ?? [])] });
  };

  const handleToggleGoalLink = (projectId: string, goalId: string) => {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    const current = target.linkedGoalIds ?? [];
    updateProject(projectId, {
      linkedGoalIds: current.includes(goalId) ? current.filter((id) => id !== goalId) : [...current, goalId],
    });
  };

  const handleToggleIdeaLink = (projectId: string, ideaId: string) => {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    const current = target.linkedIdeaIds ?? [];
    updateProject(projectId, {
      linkedIdeaIds: current.includes(ideaId) ? current.filter((id) => id !== ideaId) : [...current, ideaId],
    });
  };

  const handleToggleNoteLink = (projectId: string, noteId: string) => {
    const target = projects.find((project) => project.id === projectId);
    if (!target) return;
    const current = target.linkedNoteIds ?? [];
    updateProject(projectId, {
      linkedNoteIds: current.includes(noteId) ? current.filter((id) => id !== noteId) : [...current, noteId],
    });
  };

  return (
    <>
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">{editingProjectId ? 'Edit project' : 'Create project'}</div>
                <h2 className="mt-2 text-xl font-semibold text-stone-900 dark:text-stone-100">{editingProjectId ? 'Update project' : 'Start a new project'}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">{editingProjectId ? 'Adjust the project details and keep execution moving.' : 'Give the project a clear name before it enters active execution.'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingProjectId(null);
                }}
                className="rounded-md p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100"
                aria-label="Close project creator"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <div className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">Project name</div>
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="e.g. Launch HumanBoard onboarding refresh"
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-medium text-stone-700 dark:text-stone-200">Description</div>
                <textarea
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="What concrete build, experiment, or execution step should this project hold?"
                  rows={4}
                  className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-800"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingProjectId(null);
                }}
                className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-900 dark:hover:text-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProject}
                disabled={!draftTitle.trim()}
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200"
              >
                {editingProjectId ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Projects</h1>
          <p className="mt-1 text-stone-600 dark:text-stone-300">Active builds stay separate from incubating dreams, and activation starts around 80% readiness.</p>
        </div>
        <button
          type="button"
          onClick={handleNewProject}
          className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md hover:bg-stone-800 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </header>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-2 flex items-center gap-2 text-stone-600 dark:text-stone-300"><FolderKanban className="w-4 h-4" /> Active projects</div>
          <div className="text-3xl font-semibold text-stone-900 dark:text-stone-100">{projects.length}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
          <div className="mb-2 flex items-center gap-2 text-stone-600 dark:text-stone-300"><Sprout className="w-4 h-4" /> Incubating ideas</div>
          <div className="text-3xl font-semibold text-stone-900 dark:text-stone-100">{incubationIdeas.length}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/40">
          <div className="mb-2 flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><Sparkles className="w-4 h-4" /> Ready to activate</div>
          <div className="text-3xl font-semibold text-emerald-900 dark:text-emerald-100">{activationIdeas.length}</div>
        </div>
      </div>

      {activationIdeas.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-emerald-800">
            <Sparkles className="w-4 h-4" /> Activation candidates
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {activationIdeas.map((idea) => {
              const readiness = getReadinessMeta(idea.maturity);
              return (
                <div key={idea.id} className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">{idea.title}</h3>
                      <p className="text-sm text-stone-600 mt-2">{idea.summary}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest', readiness.tone)}>{readiness.label}</span>
                  </div>
                  <ReadinessBar maturity={idea.maturity} />
                  <p className="mt-4 text-sm text-stone-600">{readiness.hint}</p>
                  <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900">
                    <div className="font-medium mb-1">Suggested first move</div>
                    <div>{idea.nextAction || 'Choose one small, reversible action before creating a fully active project.'}</div>
                  </div>
                  <Link to={`/ideas/${idea.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800">
                    Open idea <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
          <FolderKanban className="w-4 h-4" /> Active execution
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map(project => {
              const sourceIdea = ideas.find(i => i.id === project.sourceIdeaId);
              const linkedGoalTitles = goals.filter((goal) => (project.linkedGoalIds ?? []).includes(goal.id)).map((goal) => goal.title);
              const linkedIdeaTitles = ideas.filter((idea) => (project.linkedIdeaIds ?? []).includes(idea.id)).map((idea) => idea.title);
              const linkedNotePreviews = notes.filter((note) => (project.linkedNoteIds ?? []).includes(note.id)).map((note) => note.content.slice(0, 80));
              return (
                <ProjectCard
                  key={project.id}
                  project={project}
                  sourceIdea={sourceIdea}
                  linkedGoalTitles={linkedGoalTitles}
                  linkedIdeaTitles={linkedIdeaTitles}
                  linkedNotePreviews={linkedNotePreviews}
                  availableGoals={goals.slice(0, 12).map((goal) => ({ id: goal.id, title: goal.title }))}
                  availableIdeas={ideas.slice(0, 12).map((idea) => ({ id: idea.id, title: idea.title }))}
                  availableNotes={notes.slice(0, 12).map((note) => ({ id: note.id, content: note.content }))}
                  onDelete={handleDeleteProject}
                  onEdit={handleEditProject}
                  onStatusChange={handleProjectStatusChange}
                  onSaveNextAction={handleProjectNextActionSave}
                  onSaveDefinitionOfDone={handleProjectDefinitionOfDoneSave}
                  onSaveDueDate={handleProjectDueDateSave}
                  onAddUpdate={handleProjectAddUpdate}
                  onAddTask={handleProjectAddTask}
                  onToggleTask={handleProjectToggleTask}
                  onToggleGoalLink={handleToggleGoalLink}
                  onToggleIdeaLink={handleToggleIdeaLink}
                  onToggleNoteLink={handleToggleNoteLink}
                />
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
            No active projects yet. That is fine, this page now keeps incubation visible without forcing execution.
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-800 dark:text-stone-200">
          <CircleDashed className="w-4 h-4" /> Incubation watchlist
        </div>
        {incubationIdeas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {incubationIdeas.map((idea) => {
              const readiness = getReadinessMeta(idea.maturity);
              return (
                <div key={idea.id} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-stone-900">{idea.title}</h3>
                      <p className="text-sm text-stone-600 mt-2">{idea.summary}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest', readiness.tone)}>{readiness.label}</span>
                  </div>
                  <ReadinessBar maturity={idea.maturity} />
                  <p className="mt-4 text-sm text-stone-600">{readiness.hint}</p>
                  <div className="mt-4 text-sm text-stone-700">
                    <span className="font-medium">Watch next:</span> {idea.nextAction || 'Keep collecting signals until a concrete next step becomes obvious.'}
                  </div>
                  <Link to={`/ideas/${idea.id}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-stone-900">
                    Open idea <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
            No incubating project ideas yet. Save future projects as idea type <span className="font-medium">Project</span> and they will show up here automatically.
          </div>
        )}
      </section>
      </div>
    </>
  );
}
