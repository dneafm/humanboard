import { useState } from 'react';
import { useAppStore } from '../store';
import { formatDistanceToNow } from 'date-fns';
import { Plus, ArrowRight, Archive, Lightbulb, Scale } from 'lucide-react';

export default function InboxPage() {
  const [newNote, setNewNote] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const { notes, addNote, deleteNote, addIdea, sections } = useAppStore();

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    addNote(newNote);
    setNewNote('');
  };

  const promoteToIdea = (noteId: string, noteContent: string) => {
    addIdea({
      title: noteContent.split('\n')[0].substring(0, 40) + (noteContent.length > 40 ? '...' : ''),
      summary: noteContent.substring(0, 100) + (noteContent.length > 100 ? '...' : ''),
      content: noteContent,
      type: 'Concept',
      stage: 'Seed',
      sectionId: selectedSectionId || undefined,
      confidence: 5,
      maturity: 0,
      linkedNoteIds: [noteId],
      relatedIdeaIds: [],
    });
    deleteNote(noteId);
    setSelectedSectionId('');
  };

  const saveAsPrinciple = (noteId: string, noteContent: string) => {
    addIdea({
      title: noteContent.split('\n')[0].substring(0, 40) + (noteContent.length > 40 ? '...' : ''),
      summary: noteContent.substring(0, 100) + (noteContent.length > 100 ? '...' : ''),
      content: noteContent,
      type: 'Principle',
      stage: 'Evergreen',
      sectionId: selectedSectionId || undefined,
      confidence: 10,
      maturity: 100,
      linkedNoteIds: [noteId],
      relatedIdeaIds: [],
    });
    deleteNote(noteId);
    setSelectedSectionId('');
  };

  return (
    <div className="max-w-3xl mx-auto w-full p-8 flex flex-col h-full transition-colors duration-300">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Inbox</h1>
        <p className="text-stone-500 dark:text-stone-400 mt-2 text-lg">Fast capture for raw thoughts.</p>
      </header>

      <form onSubmit={handleAdd} className="mb-12">
        <div className="relative group">
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-xl p-6 pr-14 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-600 focus:outline-none focus:ring-4 focus:ring-stone-900/5 dark:focus:ring-stone-100/5 focus:border-stone-400 dark:focus:border-stone-700 transition-all resize-none min-h-[160px] text-lg leading-relaxed shadow-sm group-hover:shadow-md"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAdd(e);
              }
            }}
          />
          <div className="absolute bottom-4 right-4 flex items-center gap-3">
            <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600 tracking-widest hidden sm:inline-block uppercase">⌘+Enter</span>
            <button
              type="submit"
              disabled={!newNote.trim()}
              className="p-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto pr-2 -mr-2 scrollbar-hide">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.2em]">Recent Notes</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">Classify to:</span>
            <select 
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-600 dark:text-stone-400 focus:outline-none"
            >
              <option value="">No Area</option>
              {sections.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-6">
          {notes.length === 0 ? (
            <div className="text-center py-16 text-stone-400 dark:text-stone-600 border border-dashed border-stone-200 dark:border-stone-800 rounded-xl bg-stone-50/50 dark:bg-stone-900/20">
              <p className="text-sm italic">Inbox zero. Your mind is clear.</p>
            </div>
          ) : (
            notes.map(note => (
              <div key={note.id} className="group bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl p-6 hover:border-stone-300 dark:hover:border-stone-700 transition-all hover:shadow-xl hover:shadow-stone-900/[0.02] dark:hover:shadow-black/20">
                <p className="text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-relaxed text-lg">{note.content}</p>
                <div className="mt-6 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600 uppercase tracking-wider">
                    {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                  </span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0">
                    <button 
                      onClick={() => promoteToIdea(note.id, note.content)}
                      className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    >
                      <Lightbulb className="w-3 h-3" />
                      Idea
                    </button>
                    <button 
                      onClick={() => saveAsPrinciple(note.id, note.content)}
                      className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-100 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                    >
                      <Scale className="w-3 h-3" />
                      Principle
                    </button>
                    <button 
                      onClick={() => deleteNote(note.id)}
                      className="text-[10px] font-bold uppercase tracking-wider text-stone-400 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <Archive className="w-3 h-3" />
                      Archive
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
