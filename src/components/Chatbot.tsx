import { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, X, Send, Maximize2, Minimize2, BookmarkPlus, Check, ImagePlus, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { askGemma, buildMemoryShapedSystemInstruction, getGemmaRuntimeStatus } from '../lib/ai';
import { useAppStore } from '../store';
import { createNoteFromImage, getClipboardImage } from '../lib/imageNote';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
};

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const runtime = getGemmaRuntimeStatus();
  const location = useLocation();
  const notes = useAppStore((state) => state.notes);
  const ideas = useAppStore((state) => state.ideas);
  const projects = useAppStore((state) => state.projects);
  const goals = useAppStore((state) => state.goals);
  const reflections = useAppStore((state) => state.reflections);
  const sections = useAppStore((state) => state.sections);
  const addIdea = useAppStore((state) => state.addIdea);
  const addNote = useAppStore((state) => state.addNote);
  const updateIdea = useAppStore((state) => state.updateIdea);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', content: "Hi. I'm your HumanBoard assistant. I can help refine ideas, suggest experiments, summarize notes, and connect thoughts across the app. What are we working on?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => () => {
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
  }, [pendingImagePreview]);

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const stageImage = (file?: File) => {
    if (!file || isAnalyzingImage || !file.type.startsWith('image/')) return;
    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const inferSectionId = () => {
    if (location.pathname.startsWith('/goals')) return 'sec2';
    if (location.pathname.startsWith('/projects')) return 'sec2';
    if (location.pathname.startsWith('/map')) return 'sec1';
    if (location.pathname.startsWith('/review')) return 'sec1';
    return 'sec1';
  };

  const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

  const findSectionId = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return inferSectionId();
    const direct = sections.find((section) => normalizeText(section.id) === normalized || normalizeText(section.name) === normalized);
    return direct?.id || inferSectionId();
  };

  const findIdeaByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return ideas.find((idea) => normalizeText(idea.id) === normalized || normalizeText(idea.title) === normalized);
  };

  const findRelatedIdeaIds = (values?: string[]) => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => findIdeaByReference(value)?.id)
      .filter((id): id is string => Boolean(id));
  };

  const buildIdeaTitle = (content: string) => {
    const cleaned = content
      .replace(/[#*_`>\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const firstSentence = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned;
    return (firstSentence || 'Saved chat insight').slice(0, 72);
  };

  const shouldCaptureAsInboxContent = (raw: string) => {
    const text = raw.trim().toLowerCase();
    if (!text) return false;

    const operationalPatterns = [
      /\bfix\b.*\b(ui|app|bug|build|route|button|page|component|review|inbox)\b/,
      /\bpatch\b.*\b(app|ui|code|component|page|route)\b/,
      /\b(refactor|rename|debug|deploy|restart|build|compile)\b/,
      /\b(humanboard|app|ui)\b.*\b(down|broken|bug|issue)\b/,
    ];

    const strategicPatterns = [
      /\bidea\b/,
      /\bthesis\b/,
      /\bopportunity\b/,
      /\bproject\b/,
      /\bgoal\b/,
      /\bprinciple\b/,
      /\bsignal\b/,
      /\bnote\b/,
      /\bremember\b/,
      /\binsight\b/,
      /\bquestion\b/,
      /\bmarket\b/,
      /\bskill\b/,
    ];

    if (operationalPatterns.some((pattern) => pattern.test(text)) && !strategicPatterns.some((pattern) => pattern.test(text))) {
      return false;
    }

    return true;
  };

  const handleSaveMessage = (message: Message) => {
    if (savedMessageIds.includes(message.id)) return;
    const content = message.content.trim();
    if (!content) return;

    addIdea({
      title: buildIdeaTitle(content),
      summary: content.replace(/\s+/g, ' ').slice(0, 220),
      content,
      type: 'Reference',
      stage: 'Sprouting',
      sectionId: inferSectionId(),
      confidence: 7,
      maturity: 55,
      nextAction: 'Review, refine, or compile this saved chat insight into a stronger knowledge page.',
      linkedNoteIds: [],
      relatedIdeaIds: [],
    });

    setSavedMessageIds((prev) => [...prev, message.id]);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const relatedContext = useMemo(() => {
    const routeHints: Record<string, string[]> = {
      '/': ['inbox', 'note', 'capture'],
      '/ideas': ['idea', 'concept', 'principle', 'reference'],
      '/goals': ['goal', 'roadmap', 'todo', 'knowledge'],
      '/projects': ['project', 'experiment'],
      '/map': ['map', 'relationship', 'related'],
      '/review': ['review', 'summary'],
      '/search': ['search', 'find'],
    };

    const hints = routeHints[location.pathname] ?? [];
    const recentUserText = messages
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content.toLowerCase())
      .join(' ');

    const scoreText = (text: string) => {
      const hay = text.toLowerCase();
      let score = 0;
      for (const hint of hints) {
        if (hay.includes(hint)) score += 3;
      }
      for (const token of recentUserText.split(/\W+/).filter(Boolean)) {
        if (token.length >= 3 && hay.includes(token)) score += 1;
      }
      return score;
    };

    const sectionName = (sectionId?: string) => sections.find((section) => section.id === sectionId)?.name;
    const collapseText = (value?: string, max = 280) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const isTensionIdea = (idea: typeof ideas[number]) => {
      const hay = `${idea.title} ${idea.summary} ${idea.content}`.toLowerCase();
      return idea.type === 'Question' && (hay.includes('unresolved tension') || hay.includes('tension'));
    };
    const ideaTypePriority = (idea: typeof ideas[number]) => {
      if (idea.type === 'Principle') return 40;
      if (isTensionIdea(idea)) return 24;
      if (idea.type === 'Question') return 18;
      if (idea.type === 'Project') return 12;
      if (idea.type === 'Concept') return 10;
      if (idea.type === 'Action') return 8;
      return 4;
    };

    const scoredIdeas = ideas
      .map((idea) => {
        const relevance = scoreText(`${idea.title} ${idea.summary} ${idea.content} ${idea.nextAction ?? ''} ${sectionName(idea.sectionId) ?? ''}`);
        const memoryWeight = ideaTypePriority(idea);
        const recencyBoost = idea.lastReviewed ? 2 : 0;
        return {
          idea,
          relevance,
          score: relevance > 0 ? relevance + memoryWeight + recencyBoost : 0,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const topPrinciples = scoredIdeas
      .filter(({ idea }) => idea.type === 'Principle')
      .slice(0, 4);

    const topTensions = scoredIdeas
      .filter(({ idea }) => isTensionIdea(idea))
      .slice(0, 3);

    const topIdeas = scoredIdeas
      .filter(({ idea }) => idea.type !== 'Principle' && !isTensionIdea(idea))
      .slice(0, 4);

    const principleContext = topPrinciples.map(({ idea }) =>
      `Principle memory: ${idea.title} | summary=${idea.summary} | content=${collapseText(idea.content)} | next=${idea.nextAction ?? 'none'}`
    );

    const tensionContext = topTensions.map(({ idea }) =>
      `Unresolved tension: ${idea.title} | summary=${idea.summary} | question=${collapseText(idea.content)} | next=${idea.nextAction ?? 'none'}`
    );

    const relatedIdeasFormatting = topIdeas.map(({ idea }) => 
      `Knowledge memory: ${idea.title} | type=${idea.type} | stage=${idea.stage} | section=${sectionName(idea.sectionId) ?? 'Unsorted'} | summary=${idea.summary} | next=${idea.nextAction ?? 'none'}`
    );

    // Graph Walk: Automatically pull in 1st-degree connected nodes of the top memory artifacts
    const multihopIdeaIds = new Set<string>();
    [...topPrinciples, ...topTensions, ...topIdeas].forEach(({ idea }) => {
      idea.relatedIdeaIds.forEach(id => multihopIdeaIds.add(id));
    });

    const graphWalkIdeas = ideas
      .filter(i => multihopIdeaIds.has(i.id) && ![...topPrinciples, ...topTensions, ...topIdeas].find(t => t.idea.id === i.id))
      .slice(0, 4)
      .map(idea => `[Linked Context via Graph]: ${idea.type === 'Principle' ? 'Principle' : isTensionIdea(idea) ? 'Tension' : 'Idea'}: ${idea.title} | summary=${idea.summary}`);

    const activeReflections = reflections
      .filter((reflection) => !reflection.dismissedAt)
      .map((reflection) => ({
        reflection,
        score: scoreText(`${reflection.pattern} ${reflection.question} ${reflection.suggestion}`),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map(({ reflection }) => `Ongoing digestion: pattern=${reflection.pattern} | question=${reflection.question} | suggestion=${reflection.suggestion}`);

    const relatedGoals = goals
      .map((goal) => ({
        score: scoreText(`${goal.title} ${goal.description} ${(goal.roadmap?.knowledge ?? []).join(' ')} ${(goal.roadmap?.ideas ?? []).join(' ')} ${(goal.roadmap?.todos ?? []).join(' ')}`),
        text: `Goal memory: ${goal.title} | status=${goal.status} | description=${goal.description} | roadmap knowledge=${(goal.roadmap?.knowledge ?? []).slice(0, 3).join('; ') || 'none'} | ideas=${(goal.roadmap?.ideas ?? []).slice(0, 3).join('; ') || 'none'} | todos=${(goal.roadmap?.todos ?? []).slice(0, 3).join('; ') || 'none'}`,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.text);

    const relatedProjects = projects
      .map((project) => ({
        score: scoreText(`${project.title} ${project.description} ${project.status} ${project.experiments.map((exp) => `${exp.title} ${exp.status} ${exp.result ?? ''}`).join(' ')}`),
        text: `Project memory: ${project.title} | status=${project.status} | description=${project.description} | experiments=${project.experiments.slice(0, 3).map((exp) => `${exp.title}(${exp.status})`).join('; ') || 'none'}`,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.text);

    const relatedNotes = notes
      .map((note) => ({
        score: scoreText(note.content),
        text: `Raw memory: ${note.content.replace(/\s+/g, ' ').slice(0, 180)}`,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => item.text);

    const fallbackIdeas = topIdeas.length === 0 && topPrinciples.length === 0 && topTensions.length === 0
      ? ideas
          .slice()
          .sort((a, b) => ideaTypePriority(b) - ideaTypePriority(a))
          .slice(0, 4)
          .map((idea) => `${idea.type === 'Principle' ? 'Principle memory' : isTensionIdea(idea) ? 'Unresolved tension' : 'Knowledge memory'}: ${idea.title} | summary=${idea.summary}`)
      : [];

    const personaIdea = ideas.find(i => i.title === 'System OS: Agent Persona');
    const personaText = personaIdea 
      ? `AGENT SYSTEM PERSONA (Operating instructions and user preferences - follow strictly):\n${personaIdea.content}\n---` 
      : '';

    return [
      personaText,
      `Current route: ${location.pathname}`,
      `Knowledge base snapshot: notes=${notes.length}, ideas=${ideas.length}, goals=${goals.length}, projects=${projects.length}, reflections=${reflections.length}`,
      'Memory hierarchy:',
      '- distilled principles first',
      '- then active reflections and unresolved tensions',
      '- then connected knowledge and active goals/projects',
      '- then raw notes only as supporting evidence',
      'Relevant context:',
      ...principleContext,
      ...activeReflections,
      ...tensionContext,
      ...relatedIdeasFormatting,
      ...graphWalkIdeas,
      ...relatedGoals,
      ...relatedProjects,
      ...relatedNotes,
      ...fallbackIdeas,
    ].filter(Boolean).join('\n');
  }, [goals, ideas, location.pathname, messages, notes, projects, reflections, sections]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pendingImage) || isLoading || isAnalyzingImage) return;

    const userMsg = input.trim();
    if (pendingImage) {
      const image = pendingImage;
      setInput('');
      setMessages((previous) => [...previous, {
        id: Date.now().toString(),
        role: 'user',
        content: [userMsg, `Image: ${image.name}`].filter(Boolean).join('\n'),
      }]);
      setIsAnalyzingImage(true);
      try {
        const note = await createNoteFromImage(image, userMsg);
        addNote(note);
        clearPendingImage();
        setMessages((previous) => [...previous, {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: `${note}\n\n*(AI: added image note to Inbox)*`,
        }]);
      } catch (error) {
        setMessages((previous) => [...previous, {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: `Image analysis error: ${error instanceof Error ? error.message : 'Could not create a note from that image.'}`,
        }]);
      } finally {
        setIsAnalyzingImage(false);
      }
      return;
    }

    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const historyContext = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      const systemInstruction = buildMemoryShapedSystemInstruction(`Use the provided HumanBoard knowledge context when relevant. Prefer connecting the user to existing notes, ideas, goals, projects, principles, and reflections before giving generic advice.

AUTONOMOUS WRITE CAPABILITY:
You can now autonomously write to the user's board, but you are an inbox gate, not a vacuum cleaner. Only save content that belongs in the HumanBoard database: ideas, strategic observations, principles, goals, projects, unresolved questions, signals, durable user preferences, or raw notes that may matter later. Do NOT save operational chatter about patching/debugging the app, UI bug reports, build/restart requests, or implementation instructions unless the user explicitly says to store them as knowledge. If your response implies creating a note or compiling an idea, you MUST use one of the tools by placing a toolcall block in your response.

Tool 1: Create an inbox note. Use this to save an episodic memory, raw thought, or quick fact.
<toolcall_create_note>The text of the note goes here</toolcall_create_note>

Tool 2: Create a knowledge Idea node. Use this when the user wants a new idea node on the board or map.
<toolcall_create_idea>
{
  "title": "Short title",
  "summary": "1 sentence string",
  "content": "detailed body",
  "type": "Concept|Principle|Reference|Project|Question|Action",
  "stage": "Seed|Sprouting|Evergreen",
  "nextAction": "optional string",
  "section": "optional section name or id",
  "confidence": 7,
  "maturity": 50,
  "relatedIdeas": ["optional existing idea title or id"]
}
</toolcall_create_idea>

Tool 3: Update an existing Idea node. Use this to manage an existing map node by changing its title, summary, content, type, stage, next action, section, confidence, maturity, or related ideas.
<toolcall_update_idea>
{
  "target": "existing idea title or id",
  "title": "optional new title",
  "summary": "optional summary",
  "content": "optional body",
  "type": "Concept|Principle|Reference|Project|Question|Action",
  "stage": "Seed|Sprouting|Evergreen|Archived",
  "nextAction": "optional string",
  "section": "optional section name or id",
  "confidence": 8,
  "maturity": 65,
  "relatedIdeas": ["optional existing idea title or id"]
}
</toolcall_update_idea>

Tool 4: Update your Persona. If you learn something new about the user's preferences, goals, or your operating constraints, dynamically update your memory persona card.
<toolcall_update_persona>
{
  "content": "Fully rewritten persona content containing all known user preferences, facts, and communication styles..."
}
</toolcall_update_persona>

When the user asks to create or manage a map idea node, prefer toolcall_create_idea or toolcall_update_idea instead of only describing what to do.
Include the toolcall anywhere in your response. You can use multiple toolcalls if needed.`);

      const responseText = await askGemma(
        `HumanBoard knowledge context:\n${relatedContext}\n\nPrevious conversation:\n${historyContext}\n\nUser: ${userMsg}`,
        systemInstruction
      );

      let cleanText = responseText;
      let matchedNote = false;
      let matchedIdea = false;
      let matchedIdeaUpdate = false;

      // Extract Create Note tool calls
      const noteRegex = /<toolcall_create_note>([\s\S]*?)<\/toolcall_create_note>/gi;
      let noteMatch;
      while ((noteMatch = noteRegex.exec(responseText)) !== null) {
        const noteContent = noteMatch[1].trim();
        if (noteContent && shouldCaptureAsInboxContent(noteContent)) {
          matchedNote = true;
          addNote(noteContent);
        }
      }
      cleanText = cleanText.replace(noteRegex, '').trim();

      // Extract Create Idea tool calls
      const ideaRegex = /<toolcall_create_idea>([\s\S]*?)<\/toolcall_create_idea>/gi;
      let ideaMatch;
      while ((ideaMatch = ideaRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = ideaMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const ideaData = JSON.parse(cleanJsonStr);
          matchedIdea = true;
          addIdea({
            title: ideaData.title || 'Untitled AI Draft',
            summary: ideaData.summary || ideaData.content?.slice(0, 100) || '',
            content: ideaData.content || '',
            type: ideaData.type || 'Concept',
            stage: ideaData.stage || 'Seed',
            sectionId: findSectionId(ideaData.section),
            confidence: Number.isFinite(ideaData.confidence) ? Math.max(1, Math.min(10, Number(ideaData.confidence))) : 7,
            maturity: Number.isFinite(ideaData.maturity) ? Math.max(0, Math.min(100, Number(ideaData.maturity))) : 50,
            nextAction: ideaData.nextAction || '',
            linkedNoteIds: [],
            relatedIdeaIds: findRelatedIdeaIds(ideaData.relatedIdeas),
          });
        } catch (err) {
          console.error("Failed to parse create_idea toolcall JSON:", err);
        }
      }
      cleanText = cleanText.replace(ideaRegex, '').trim();

      // Extract Update Idea tool calls
      const updateIdeaRegex = /<toolcall_update_idea>([\s\S]*?)<\/toolcall_update_idea>/gi;
      let updateIdeaMatch;
      while ((updateIdeaMatch = updateIdeaRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = updateIdeaMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const ideaData = JSON.parse(cleanJsonStr);
          const targetIdea = findIdeaByReference(ideaData.target);
          if (!targetIdea) continue;
          matchedIdeaUpdate = true;
          updateIdea(targetIdea.id, {
            title: ideaData.title || targetIdea.title,
            summary: ideaData.summary || targetIdea.summary,
            content: ideaData.content || targetIdea.content,
            type: ideaData.type || targetIdea.type,
            stage: ideaData.stage || targetIdea.stage,
            sectionId: ideaData.section ? findSectionId(ideaData.section) : targetIdea.sectionId,
            confidence: Number.isFinite(ideaData.confidence) ? Math.max(1, Math.min(10, Number(ideaData.confidence))) : targetIdea.confidence,
            maturity: Number.isFinite(ideaData.maturity) ? Math.max(0, Math.min(100, Number(ideaData.maturity))) : targetIdea.maturity,
            nextAction: ideaData.nextAction ?? targetIdea.nextAction,
            relatedIdeaIds: Array.isArray(ideaData.relatedIdeas) ? findRelatedIdeaIds(ideaData.relatedIdeas) : targetIdea.relatedIdeaIds,
          });
        } catch (err) {
          console.error("Failed to parse update_idea toolcall JSON:", err);
        }
      }
      cleanText = cleanText.replace(updateIdeaRegex, '').trim();

      // Extract Update Persona tool calls
      const personaRegex = /<toolcall_update_persona>([\s\S]*?)<\/toolcall_update_persona>/gi;
      let personaMatch;
      let matchedPersona = false;
      while ((personaMatch = personaRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = personaMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          matchedPersona = true;
          
          const existingPersona = ideas.find(i => i.title === 'System OS: Agent Persona');
          if (existingPersona && data.content) {
             updateIdea(existingPersona.id, { 
               content: data.content, 
               summary: data.content.slice(0, 200) + '...'
             });
          } else if (data.content) {
             addIdea({
               title: 'System OS: Agent Persona',
               summary: data.content.slice(0, 200) + '...',
               content: data.content,
               type: 'Principle',
               stage: 'Evergreen',
               sectionId: inferSectionId(),
               confidence: 10,
               maturity: 100,
               nextAction: 'Strict system guidelines',
               linkedNoteIds: [],
               relatedIdeaIds: [],
             });
          }
        } catch (err) {
          console.error("Failed to parse update_persona toolcall JSON:", err);
        }
      }
      cleanText = cleanText.replace(personaRegex, '').trim();

      let actionMessage = '';
      if (matchedNote || matchedIdea || matchedIdeaUpdate || matchedPersona) {
        actionMessage = "\n\n*(AI: ";
        const acts = [];
        if (matchedNote) acts.push("added to Inbox");
        if (matchedIdea) acts.push("created Idea node");
        if (matchedIdeaUpdate) acts.push("updated Idea node");
        if (matchedPersona) acts.push("updated System Persona");
        actionMessage += acts.join(", ") + ")*";
      }

      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: (cleanText || "I have saved that to your board.") + actionMessage 
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      const detail = error instanceof Error ? error.message : 'Unknown AI runtime error.';
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: `AI runtime error: ${detail}` 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-12 h-12 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full flex items-center justify-center shadow-lg hover:bg-stone-800 dark:hover:bg-stone-200 transition-transform hover:scale-105 z-50"
      >
        <Bot className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div 
      className={cn(
        "fixed z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col transition-all duration-300 ease-in-out overflow-hidden bottom-3 right-3 left-3 max-w-[calc(100vw-1.5rem)] md:left-auto md:bottom-6 md:right-6",
        isExpanded
          ? "h-[85vh] md:w-[600px] md:h-[800px] rounded-xl"
          : "w-full h-[70vh] md:w-[380px] md:h-[600px] rounded-2xl"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/50">
        <div className="flex flex-col gap-1 text-stone-800 dark:text-stone-200 font-medium text-sm">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            HumanBoard Assistant
          </div>
          <div className="text-[11px] text-stone-500 dark:text-stone-400">
            AI: {runtime.model} · {runtime.local ? 'local runtime' : runtime.baseUrl}
          </div>
        </div>
        <div className="flex items-center gap-1 text-stone-400 dark:text-stone-500">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              msg.role === 'user' 
                ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 rounded-br-sm font-medium" 
                : "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200 rounded-bl-sm prose prose-sm prose-stone dark:prose-invert"
            )}>
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleSaveMessage(msg)}
                      disabled={savedMessageIds.includes(msg.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 transition-colors hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:cursor-default disabled:opacity-70"
                    >
                      {savedMessageIds.includes(msg.id) ? (
                        <>
                          <Check className="w-3 h-3" />
                          Saved
                        </>
                      ) : (
                        <>
                          <BookmarkPlus className="w-3 h-3" />
                          Save to board
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        {(isLoading || isAnalyzingImage) && (
          <div className="flex justify-start">
            <div className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900">
        {pendingImagePreview && (
          <div className="mb-3 flex items-end gap-2">
            <div className="relative h-20 w-20 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950">
              <img src={pendingImagePreview} alt="Pending chat attachment" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={clearPendingImage}
                className="absolute right-1 top-1 rounded-full bg-stone-950/80 p-1 text-white hover:bg-stone-950"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <span className="truncate text-xs text-stone-500 dark:text-stone-400">{pendingImage?.name}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label
            className="shrink-0 cursor-pointer rounded-full border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-3 text-stone-600 dark:text-stone-400 transition-colors hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-200"
            title="Create note from image"
          >
            {isAnalyzingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={isAnalyzingImage || isLoading}
              onChange={(event) => {
                stageImage(event.target.files?.[0]);
                event.currentTarget.value = '';
              }}
            />
          </label>
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(event) => {
                const image = getClipboardImage(event.clipboardData);
                if (!image) return;
                event.preventDefault();
                stageImage(image);
              }}
              placeholder="Ask anything..."
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-full py-3 pl-4 pr-12 text-sm text-stone-900 dark:text-stone-100 caret-stone-900 dark:caret-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-white/10 focus:border-stone-400 dark:focus:border-stone-600"
              style={{ WebkitTextFillColor: 'currentColor' }}
            />
            <button
              type="submit"
              disabled={(!input.trim() && !pendingImage) || isLoading || isAnalyzingImage}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
