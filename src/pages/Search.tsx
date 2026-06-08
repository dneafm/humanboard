import { useState } from 'react';
import { useAppStore } from '../store';
import { Search as SearchIcon, Lightbulb, Inbox as InboxIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'ideas' | 'notes'>('all');
  const { ideas, notes } = useAppStore();

  const filteredIdeas = ideas.filter(i => 
    i.title.toLowerCase().includes(query.toLowerCase()) || 
    i.summary.toLowerCase().includes(query.toLowerCase()) ||
    i.content.toLowerCase().includes(query.toLowerCase())
  );

  const filteredNotes = notes.filter(n => 
    n.content.toLowerCase().includes(query.toLowerCase())
  );

  const showIdeas = filter === 'all' || filter === 'ideas';
  const showNotes = filter === 'all' || filter === 'notes';

  return (
    <div className="max-w-3xl mx-auto w-full p-8 flex flex-col h-full">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 mb-6">Search</h1>
        
        <div className="relative mb-6">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas, notes, and projects..."
            className="w-full bg-stone-50 border border-stone-200 rounded-xl py-4 pl-12 pr-4 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400 text-lg"
            autoFocus
          />
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${filter === 'all' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('ideas')}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${filter === 'ideas' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Ideas
          </button>
          <button 
            onClick={() => setFilter('notes')}
            className={`px-3 py-1.5 text-sm font-medium rounded-full transition-colors flex items-center gap-1.5 ${filter === 'notes' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
          >
            <InboxIcon className="w-3.5 h-3.5" />
            Notes
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto space-y-8">
        {query && showIdeas && filteredIdeas.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Lightbulb className="w-3 h-3" />
              Ideas
            </h3>
            <div className="space-y-3">
              {filteredIdeas.map(idea => (
                <Link key={idea.id} to={`/ideas/${idea.id}`} className="block group">
                  <div className="bg-white border border-stone-200 rounded-lg p-4 hover:border-stone-300 transition-colors">
                    <h4 className="font-medium text-stone-900 group-hover:text-blue-600 transition-colors">{idea.title}</h4>
                    <p className="text-sm text-stone-500 line-clamp-1 mt-1">{idea.summary}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {query && showNotes && filteredNotes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <InboxIcon className="w-3 h-3" />
              Notes
            </h3>
            <div className="space-y-3">
              {filteredNotes.map(note => (
                <div key={note.id} className="bg-white border border-stone-200 rounded-lg p-4">
                  <p className="text-sm text-stone-800 line-clamp-2">{note.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {query && filteredIdeas.length === 0 && filteredNotes.length === 0 && (
          <div className="text-center py-12 text-stone-500">
            No results found for "{query}"
          </div>
        )}

        {!query && (
          <div className="text-center py-12 text-stone-400">
            Start typing to search your second brain.
          </div>
        )}
      </div>
    </div>
  );
}
