import { useState, useEffect } from 'react';
import { Moon, Sparkles, Loader2 } from 'lucide-react';
import { useAppStore } from '../store';
import { compileRawNoteToKnowledge } from '../lib/ai';

export default function MemoryConsolidator() {
  const notes = useAppStore(state => state.notes);
  const addIdea = useAppStore(state => state.addIdea);
  const deleteNote = useAppStore(state => state.deleteNote);
  
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [progress, setProgress] = useState(0);

  // We consider notes "unprocessed" if they haven't been compiled
  // For simplicity, we just process all current notes. In a real app we'd filter by time.
  const uncompiledNotes = notes;

  const triggerConsolidation = async () => {
    if (isConsolidating || uncompiledNotes.length === 0) return;
    setIsConsolidating(true);
    setProgress(0);

    try {
      // Process oldest first to respect chronological order of thoughts
      const toProcess = [...uncompiledNotes].reverse();
      
      for (let i = 0; i < toProcess.length; i++) {
        const note = toProcess[i];
        try {
          const compiled = await compileRawNoteToKnowledge(note.content);
          
          addIdea({
            title: compiled.title,
            summary: compiled.summary,
            content: compiled.content,
            type: compiled.type || 'Concept',
            stage: compiled.stage || 'Seed',
            confidence: compiled.confidence || 5,
            maturity: compiled.maturity || 30,
            nextAction: compiled.nextAction || '',
            linkedNoteIds: [note.id],
            relatedIdeaIds: [],
            tags: compiled.tags || [],
            sourceNoteExcerpt: compiled.sourceNoteExcerpt || '',
            compileReason: compiled.compileReason || '',
            openQuestions: compiled.openQuestions || [],
            sectionId: 'sec1', // Default section
          });

          // Optional: After successful compilation, we could mark the note as compiled,
          // or delete it from the raw Inbox to keep it clean. Let's delete to show consolidation.
          deleteNote(note.id);
          
        } catch (err) {
          console.error("Failed to compile note:", note.id, err);
        }
        setProgress(((i + 1) / toProcess.length) * 100);
      }
    } finally {
      setIsConsolidating(false);
      setProgress(0);
    }
  };

  // Background IDLE loop: True Autonomous Memory Consolidation
  useEffect(() => {
    const handleSleepOrIdle = () => {
      // If the tab is hidden (user switched away) or idle, and we have enough raw thoughts, 
      // the Agent wakes up to consolidate them autonomously.
      if (document.visibilityState === 'hidden' && uncompiledNotes.length >= 3 && !isConsolidating) {
        triggerConsolidation();
      }
    };

    // 1. Regular heartbeat check (every 20s)
    const timer = setInterval(handleSleepOrIdle, 20000);

    // 2. Event-driven check when user explicitly switches tabs
    document.addEventListener("visibilitychange", handleSleepOrIdle);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleSleepOrIdle);
    };
  }, [uncompiledNotes.length, isConsolidating]);

  if (uncompiledNotes.length === 0 && !isConsolidating) {
    return (
      <div className="flex items-center gap-3 px-3 py-2 text-sm text-stone-500 dark:text-stone-500">
        <Moon className="w-4 h-4" />
        <span>Memory rests (0 raw)</span>
      </div>
    );
  }

  return (
    <button 
      onClick={triggerConsolidation}
      disabled={isConsolidating}
      className="flex items-center justify-between px-3 py-2 w-full rounded-md text-sm font-medium text-stone-600 dark:text-stone-400 hover:bg-white dark:hover:bg-stone-900 shadow-sm border border-stone-200 dark:border-stone-800 transition-all relative overflow-hidden group"
    >
      <div className="flex items-center gap-3 relative z-10">
        {isConsolidating ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Sparkles className="w-4 h-4 text-amber-500 group-hover:animate-pulse" />}
        <span className={isConsolidating ? "text-blue-600 dark:text-blue-400" : ""}>
          {isConsolidating ? 'Consolidating...' : `Sleep / Consolidate (${uncompiledNotes.length})`}
        </span>
      </div>
      
      {isConsolidating && (
        <div 
          className="absolute left-0 top-0 bottom-0 bg-blue-100 dark:bg-blue-900/30 transition-all duration-300 z-0" 
          style={{ width: `${progress}%` }}
        />
      )}
    </button>
  );
}
