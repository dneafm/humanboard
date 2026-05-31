import { useAppStore } from '../store';
import { FolderKanban, Plus, FlaskConical, ArrowRight, Sparkles, Sprout, CircleDashed } from 'lucide-react';
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

function ProjectCard({ project, sourceIdea }: { project: any; sourceIdea?: any }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 hover:border-stone-300 transition-all shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-600">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-stone-900">{project.title}</h3>
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
      </div>

      <p className="text-stone-600 text-sm mb-6">{project.description}</p>

      {sourceIdea && (
        <div className="mb-6 bg-stone-50 rounded-lg p-3 border border-stone-100">
          <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Source Idea</div>
          <Link to={`/ideas/${sourceIdea.id}`} className="text-sm font-medium text-stone-700 hover:text-blue-600 flex items-center gap-1 group">
            {sourceIdea.title}
            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </Link>
        </div>
      )}

      {project.experiments.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <FlaskConical className="w-3 h-3" />
            Experiments
          </h4>
          <div className="space-y-2">
            {project.experiments.map((exp: any) => (
              <div key={exp.id} className="flex items-center justify-between text-sm p-2 bg-white border border-stone-100 rounded-md">
                <span className="text-stone-700">{exp.title}</span>
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
  const { projects, ideas } = useAppStore();

  const linkedIdeaIds = new Set(projects.map((project) => project.sourceIdeaId));
  const projectIdeas = ideas.filter((idea) => idea.type === 'Project');
  const incubationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity < ACTIVATION_THRESHOLD);
  const activationIdeas = projectIdeas.filter((idea) => !linkedIdeaIds.has(idea.id) && idea.maturity >= ACTIVATION_THRESHOLD);

  return (
    <div className="max-w-6xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Projects</h1>
          <p className="text-stone-500 mt-1">Active builds stay separate from incubating dreams, and activation starts around 80% readiness.</p>
        </div>
        <button className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </header>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2 text-stone-500 mb-2"><FolderKanban className="w-4 h-4" /> Active projects</div>
          <div className="text-3xl font-semibold text-stone-900">{projects.length}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <div className="flex items-center gap-2 text-stone-500 mb-2"><Sprout className="w-4 h-4" /> Incubating ideas</div>
          <div className="text-3xl font-semibold text-stone-900">{incubationIdeas.length}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700 mb-2"><Sparkles className="w-4 h-4" /> Ready to activate</div>
          <div className="text-3xl font-semibold text-emerald-800">{activationIdeas.length}</div>
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
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-stone-800">
          <FolderKanban className="w-4 h-4" /> Active execution
        </div>
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {projects.map(project => {
              const sourceIdea = ideas.find(i => i.id === project.sourceIdeaId);
              return <ProjectCard key={project.id} project={project} sourceIdea={sourceIdea} />;
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-stone-600">
            No active projects yet. That is fine, this page now keeps incubation visible without forcing execution.
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4 text-sm font-semibold text-stone-800">
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
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-stone-600">
            No incubating project ideas yet. Save future projects as idea type <span className="font-medium">Project</span> and they will show up here automatically.
          </div>
        )}
      </section>
    </div>
  );
}
