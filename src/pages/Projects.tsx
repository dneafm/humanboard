import { useAppStore } from '../store';
import { FolderKanban, Plus, FlaskConical, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function ProjectsPage() {
  const { projects, ideas } = useAppStore();

  return (
    <div className="max-w-5xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">Projects</h1>
          <p className="text-stone-500 mt-1">Where ideas become reality.</p>
        </div>
        <button className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-md hover:bg-stone-800 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projects.map(project => {
          const sourceIdea = ideas.find(i => i.id === project.sourceIdeaId);
          
          return (
            <div key={project.id} className="bg-white border border-stone-200 rounded-xl p-6 hover:border-stone-300 transition-all shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-stone-100 rounded-lg flex items-center justify-center text-stone-600">
                    <FolderKanban className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-stone-900">{project.title}</h3>
                    <span className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block",
                      project.status === 'Active' ? "bg-blue-50 text-blue-700" :
                      project.status === 'Completed' ? "bg-green-50 text-green-700" :
                      "bg-stone-100 text-stone-600"
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
                    {project.experiments.map(exp => (
                      <div key={exp.id} className="flex items-center justify-between text-sm p-2 bg-white border border-stone-100 rounded-md">
                        <span className="text-stone-700">{exp.title}</span>
                        <span className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider",
                          exp.status === 'Running' ? "bg-amber-50 text-amber-700 border border-amber-200" :
                          exp.status === 'Concluded' ? "bg-stone-100 text-stone-500" :
                          "bg-stone-50 text-stone-400"
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
        })}
      </div>
    </div>
  );
}
