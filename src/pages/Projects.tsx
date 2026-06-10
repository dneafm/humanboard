import { useState } from 'react';
import { useAppStore } from '../store';
import { FolderKanban, Plus, FlaskConical, ArrowRight, Sparkles, Sprout, CircleDashed, X, Trash2 } from 'lucide-react';
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

function ProjectCard({ project, sourceIdea, onDelete }: { project: any; sourceIdea?: any; onDelete: (projectId: string) => void }) {
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
  const { projects, ideas, addProject, deleteProject } = useAppStore();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');

  const linkedIdeaIds = new Set(projects.map((project) => project.sourceIdeaId));
  const projectIdeas = ideas.filter((idea) => idea.type === 'Project');
  const incubationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity < ACTIVATION_THRESHOLD);
  const activationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity >= ACTIVATION_THRESHOLD);

  const handleNewProject = () => {
    setDraftTitle('');
    setDraftDescription('');
    setIsCreateOpen(true);
  };

  const handleCreateProject = () => {
    const title = draftTitle.trim();
    const description = draftDescription.trim();
    if (!title) return;

    addProject({
      title,
      description: description || 'Define the first concrete build, experiment, or execution step for this project.',
      sourceIdeaId: '',
      status: 'Active',
      experiments: [],
    });

    setIsCreateOpen(false);
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

  return (
    <>
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-800 dark:bg-stone-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">Create project</div>
                <h2 className="mt-2 text-xl font-semibold text-stone-900 dark:text-stone-100">Start a new project</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">Give the project a clear name before it enters active execution.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
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
                onClick={() => setIsCreateOpen(false)}
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
                Create Project
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
              return <ProjectCard key={project.id} project={project} sourceIdea={sourceIdea} onDelete={handleDeleteProject} />;
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
