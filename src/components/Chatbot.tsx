import { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, X, Send, Maximize2, Minimize2, BookmarkPlus, Check, Image as ImageIcon, Loader2, Plus, Trash2, Pencil, Search, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { askGemma, buildMemoryShapedSystemInstruction, getGemmaRuntimeStatus, analyzeImageToNote, extractWebContent, detectTruncatedToolcall } from '../lib/ai';
import { diffFusionFields } from '../lib/fusionUpdateDiff';
import { recordDebugEvent } from '../lib/debugLog';
import { getClipboardImage } from '../lib/imageNote';
import { getStoredAutoDistillLevel, autoDistillInstructionForLevel } from '../lib/autoDistill';
import { shouldTreatAsMeaningfulNote } from '../lib/noteQuality';
import { colorForNewSection, findSectionByName, normalizeSectionName } from '../lib/sections';
import { buildWholeVaultIndex } from '../lib/vaultContext';
import { useAppStore, type FusionType, type FusionStatus, type FusionAudience } from '../store';
import { useAuthStore } from '../stores/authStore';
import type { ChatMessage } from '../lib/storage/types';
import productDocs from '../../docs/product-knowledge.md?raw';

const AI_HISTORY_MESSAGE_LIMIT = 12;
const AI_HISTORY_CHARACTER_LIMIT = 12_000;
const URL_REGEX = /https?:\/\/[^\s)]+/gi;

const FUSION_TYPES: FusionType[] = ['Post', 'Writing', 'Thesis', 'Report'];
const FUSION_STATUSES: FusionStatus[] = ['Draft', 'Synthesizing', 'Ready', 'Completed'];
const FUSION_AUDIENCES: FusionAudience[] = ['Personal', 'Team', 'Public', 'Client'];

function normalizeFusionType(value: unknown, fallback: FusionType = 'Writing'): FusionType {
  if (typeof value === 'string' && (FUSION_TYPES as string[]).includes(value)) return value as FusionType;
  if (typeof value === 'string') {
    const match = FUSION_TYPES.find((t) => t.toLowerCase() === value.toLowerCase());
    if (match) return match;
  }
  return fallback;
}

function normalizeFusionStatus(value: unknown, fallback: FusionStatus = 'Draft'): FusionStatus {
  if (typeof value === 'string' && (FUSION_STATUSES as string[]).includes(value)) return value as FusionStatus;
  if (typeof value === 'string') {
    const match = FUSION_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase());
    if (match) return match;
  }
  return fallback;
}

function normalizeFusionAudience(value: unknown, fallback: FusionAudience = 'Personal'): FusionAudience {
  if (typeof value === 'string' && (FUSION_AUDIENCES as string[]).includes(value)) return value as FusionAudience;
  if (typeof value === 'string') {
    const match = FUSION_AUDIENCES.find((a) => a.toLowerCase() === value.toLowerCase());
    if (match) return match;
  }
  return fallback;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return undefined;
  return String(value);
}

function buildAiHistoryContext(messages: ChatMessage[]) {
  const recentMessages = messages.slice(-AI_HISTORY_MESSAGE_LIMIT);
  const history = recentMessages
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n');

  return history.length > AI_HISTORY_CHARACTER_LIMIT
    ? history.slice(-AI_HISTORY_CHARACTER_LIMIT)
    : history;
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCta, setShowCta] = useState(() => {
    try {
      return sessionStorage.getItem('hb_hide_cta') !== 'true';
    } catch {
      return true;
    }
  });
  const runtime = getGemmaRuntimeStatus();
  const location = useLocation();
  const notes = useAppStore((state) => state.notes);
  const ideas = useAppStore((state) => state.ideas);
  const projects = useAppStore((state) => state.projects);
  const goals = useAppStore((state) => state.goals);
  const reflections = useAppStore((state) => state.reflections);
  const capabilityBets = useAppStore((state) => state.capabilityBets);
  const fusionItems = useAppStore((state) => state.fusionItems);
  const sections = useAppStore((state) => state.sections);
  const addIdea = useAppStore((state) => state.addIdea);
  const addNote = useAppStore((state) => state.addNote);
  const updateNote = useAppStore((state) => state.updateNote);
  const addGoal = useAppStore((state) => state.addGoal);
  const addSection = useAppStore((state) => state.addSection);
  const updateIdea = useAppStore((state) => state.updateIdea);
  const updateGoal = useAppStore((state) => state.updateGoal);
  const deleteProject = useAppStore((state) => state.deleteProject);
  const addFusionItem = useAppStore((state) => state.addFusionItem);
  const updateFusionItem = useAppStore((state) => state.updateFusionItem);
  const deleteFusionItem = useAppStore((state) => state.deleteFusionItem);
  const addCapabilityBet = useAppStore((state) => state.addCapabilityBet);
  const updateCapabilityBet = useAppStore((state) => state.updateCapabilityBet);
  const userId = useAuthStore((state) => state.userId);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoDistill, setAutoDistill] = useState(false);
  const autoDistillLevel = getStoredAutoDistillLevel();
  
  const chatMessages = useAppStore((state) => state.chatMessages);
  const setChatMessages = useAppStore((state) => state.setChatMessages);

  // Chat thread management store bindings
  const chatThreads = useAppStore((state) => state.chatThreads);
  const activeThreadId = useAppStore((state) => state.activeThreadId);
  const setActiveThreadId = useAppStore((state) => state.setActiveThreadId);
  const createChatThread = useAppStore((state) => state.createChatThread);
  const deleteChatThread = useAppStore((state) => state.deleteChatThread);
  const renameChatThread = useAppStore((state) => state.renameChatThread);

  // Local component states for conversation threads
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitleInput, setEditTitleInput] = useState('');

  const displayedMessages = useMemo<ChatMessage[]>(() => {
    if (!chatMessages || chatMessages.length === 0) {
      return [
        {
          id: 'default-greeting',
          role: 'model',
          content: "Hi. I'm your HumanBoard assistant. I can help refine ideas, suggest experiments, summarize notes, and connect thoughts across the app. What are we working on?",
          createdAt: new Date().toISOString(),
        }
      ];
    }
    return chatMessages;
  }, [chatMessages]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savedMessageIds, setSavedMessageIds] = useState<string[]>([]);
  const [webReadingStatus, setWebReadingStatus] = useState<string | null>(null);

  // Staging image state
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    };
  }, [pendingImagePreview]);

  const stageImage = (file?: File) => {
    if (!file || isAnalyzingImage || !file.type.startsWith('image/')) return;
    setImageError(null);
    setPendingImage(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const clearPendingImage = () => {
    setPendingImage(null);
    setPendingImagePreview(null);
  };

  const readAsDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('HumanBoard could not read that image.'));
      reader.readAsDataURL(file);
    });
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoDistillStorageKey = `humanboard.chat.auto-distill.${userId || 'anonymous'}`;

  useEffect(() => {
    setAutoDistill(window.localStorage.getItem(autoDistillStorageKey) === 'true');
  }, [autoDistillStorageKey]);

  const toggleAutoDistill = () => {
    setAutoDistill((current) => {
      const next = !current;
      window.localStorage.setItem(autoDistillStorageKey, String(next));
      return next;
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const inferSectionId = () => {
    if (location.pathname.startsWith('/goals')) return 'sec2';
    if (location.pathname.startsWith('/projects')) return 'sec2';
    if (location.pathname.startsWith('/map')) return 'sec1';
    if (location.pathname.startsWith('/review')) return 'sec1';
    return 'sec1';
  };

  const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase();

  const ensureSectionId = (value?: string) => {
    const normalized = normalizeSectionName(value);
    if (!normalized) return inferSectionId();

    const direct = findSectionByName(sections, value);
    if (direct) return direct.id;

    const prettyName = String(value || '').trim().replace(/\s+/g, ' ');
    if (!prettyName) return inferSectionId();

    return addSection({
      name: prettyName,
      color: colorForNewSection(sections),
    });
  };

  const findSectionId = (value?: string) => ensureSectionId(value);

  const findIdeaByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return ideas.find((idea) => normalizeText(idea.id) === normalized || normalizeText(idea.title) === normalized);
  };

  const findGoalByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return goals.find((goal) => normalizeText(goal.id) === normalized || normalizeText(goal.title) === normalized);
  };

  const findProjectByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return projects.find((project) => normalizeText(project.id) === normalized || normalizeText(project.title) === normalized);
  };

  const findCapabilityBetByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return capabilityBets.find((bet) => normalizeText(bet.id) === normalized || normalizeText(bet.title) === normalized);
  };

  const findFusionByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    // 1) Exact id match (most reliable).
    const byId = fusionItems.find((item) => normalizeText(item.id) === normalized);
    if (byId) return byId;
    // 2) Exact title match (case-insensitive).
    const byExactTitle = fusionItems.find((item) => normalizeText(item.title) === normalized);
    if (byExactTitle) return byExactTitle;
    // 3) Substring match on title — lets "edit the regen-finance fusion"
    //    resolve to "Regenerative Finance Thesis" instead of failing.
    //    Picks the shortest title that contains the normalized ref, so
    //    "Foo" doesn't accidentally resolve to a much longer title.
    const substringMatches = fusionItems
      .filter((item) => normalizeText(item.title).includes(normalized))
      .sort((a, b) => a.title.length - b.title.length);
    if (substringMatches.length > 0) return substringMatches[0];
    return undefined;
  };

  const findRelatedIdeaIds = (values?: string[]) => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => findIdeaByReference(value)?.id)
      .filter((id): id is string => Boolean(id));
  };

  const findNoteByReference = (value?: string) => {
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    return notes.find((note) => normalizeText(note.id) === normalized || normalizeText(note.content).includes(normalized));
  };

  const findRelatedNoteIds = (values?: string[]) => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => findNoteByReference(value)?.id)
      .filter((id): id is string => Boolean(id));
  };

  const findRelatedGoalIds = (values?: string[]) => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => findGoalByReference(value)?.id)
      .filter((id): id is string => Boolean(id));
  };

  const findRelatedProjectIds = (values?: string[]) => {
    if (!Array.isArray(values)) return [];
    return values
      .map((value) => findProjectByReference(value)?.id)
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
    if (!shouldTreatAsMeaningfulNote(raw)) return false;

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

  const explicitlyRequestsBoardWrite = (raw: string) => (
    /\b(save|store|remember|capture|record|add|create|compile|update|edit|revise|rewrite|expand|mark)\b[\s\S]{0,40}\b(note|idea|board|inbox|map|knowledge|goal|project|fusion|bet|thesis|report|post|writing|synthesis|draft)\b/i.test(raw)
    || /\b(note|idea|board|inbox|map|knowledge|goal|project|fusion|bet|thesis|report|post|writing|synthesis|draft)\b[\s\S]{0,40}\b(save|store|remember|capture|record|add|create|compile|update|edit|revise|rewrite|expand|mark)\b/i.test(raw)
    || /\b(save|store|remember|capture|record)\s+(this|that|it)\b/i.test(raw)
  );

  const extractUrls = (raw: string) => Array.from(new Set((raw.match(URL_REGEX) || []).map((url) => url.trim()))).slice(0, 2);

  const handleSaveMessage = (message: ChatMessage) => {
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
  }, [displayedMessages, isOpen]);

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
    const recentUserText = displayedMessages
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
    const wholeVaultIndex = buildWholeVaultIndex({
      notes,
      ideas,
      projects,
      fusionItems,
      goals,
      reflections,
      capabilityBets,
      sections,
    });

    return [
      personaText,
      `Current route: ${location.pathname}`,
      `Knowledge base snapshot: notes=${notes.length}, ideas=${ideas.length}, goals=${goals.length}, projects=${projects.length}, reflections=${reflections.length}, capability bets=${capabilityBets.length}, fusion artifacts=${fusionItems.length}`,
      wholeVaultIndex,
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
  }, [capabilityBets, fusionItems, goals, ideas, location.pathname, displayedMessages, notes, projects, reflections, sections]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !pendingImage) || isLoading) return;

    const userMsg = input.trim();
    const imageToProcess = pendingImage;

    setInput('');
    clearPendingImage();
    setIsLoading(true);

    try {
      let base64Url = '';
      let imageAnalysisResult = '';

      if (imageToProcess) {
        setIsAnalyzingImage(true);
        try {
          base64Url = await readAsDataUrl(imageToProcess);
          imageAnalysisResult = await analyzeImageToNote(base64Url, imageToProcess.name, userMsg);
        } catch (err) {
          setImageError(err instanceof Error ? err.message : 'HumanBoard could not analyze that image.');
          setIsLoading(false);
          setIsAnalyzingImage(false);
          return;
        }
        setIsAnalyzingImage(false);
      }

      const historyContext = buildAiHistoryContext(displayedMessages);
      const urls = extractUrls(userMsg);
      let webContext = '';
      if (urls.length) {
        setWebReadingStatus(`Reading ${urls.length === 1 ? 'link' : 'links'}...`);
        const extractedPages = await Promise.all(urls.map(async (url) => {
          const page = await extractWebContent(url);
          return [
            `URL: ${page.url}`,
            page.title ? `Title: ${page.title}` : '',
            page.description ? `Description: ${page.description}` : '',
            `Content:\n${page.content}`,
          ].filter(Boolean).join('\n');
        }));
        webContext = `\n\nWeb content extracted from URLs:\n---\n${extractedPages.join('\n\n---\n\n')}\n---`;
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: userMsg || `[Image: ${imageToProcess?.name || 'Attachment'}]`,
        createdAt: new Date().toISOString(),
        ...(base64Url ? { imageUrl: base64Url } : {})
      };

      setChatMessages([...chatMessages, userMessage]);
      recordDebugEvent({
        type: 'user_message',
        label: 'chatbot.handleSubmit',
        payload: {
          messageId: userMessage.id,
          chars: (userMessage.content || '').length,
          hasImage: Boolean(base64Url),
        },
      });
      const explicitBoardWrite = explicitlyRequestsBoardWrite(userMsg);
      const systemInstruction = buildMemoryShapedSystemInstruction(`Use the provided HumanBoard knowledge context when relevant. The whole-vault index gives complete entity-level awareness; the relevance-ranked context gives deeper evidence. Prefer connecting the user to existing notes, ideas, goals, projects, principles, capability bets, fusion artifacts, and reflections before giving generic advice. For broad assessment requests, explicitly assess patterns, gaps, contradictions, concentration, and neglected areas across the whole vault.

${productDocs}

AUTONOMOUS WRITE CAPABILITY:
Auto-distill is ${autoDistill ? 'ENABLED' : 'DISABLED'}.
Auto-distill selectivity is ${autoDistillLevel.toUpperCase()}.
${autoDistill
  ? autoDistillInstructionForLevel(autoDistillLevel)
  : `Do not create notes or ideas unless the user explicitly asks you to save, capture, remember, add, create, compile, or update one. Continue answering normally without writing inferred information to the board.`}
Only save content that belongs in the HumanBoard database. Do NOT save operational chatter about patching/debugging the app, UI bug reports, build/restart requests, or implementation instructions unless the user explicitly says to store them as knowledge.

Tool 1: Create an inbox note. Use this to save an episodic memory, raw thought, or quick fact.
<toolcall_create_note>The text of the note goes here</toolcall_create_note>

Tool 2: Create a knowledge Idea node. Use this when the user wants a new idea node on the board or map. If this is an incubation candidate, optional incubation fields can be supplied.
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
  "relatedIdeas": ["optional existing idea title or id"],
  "incubationDecision": "optional decision string (e.g. Keep Watching, Warm Up / Explore, Parked / Defer, Ready to Activate)",
  "reviewCadence": "optional review schedule (e.g. weekly, bi-weekly, monthly)"
}
</toolcall_create_idea>

Tool 3: Update an existing Idea node. Use this to manage an existing map node by changing its properties, including moving it in or out of incubation.
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
  "relatedIdeas": ["optional existing idea title or id"],
  "incubationDecision": "optional decision string (e.g. Keep Watching, Warm Up / Explore, Parked / Defer, Ready to Activate)",
  "reviewCadence": "optional review schedule (e.g. weekly, bi-weekly, monthly)"
}
</toolcall_update_idea>

Tool 4: Update your Persona. If you learn something new about the user's preferences, goals, or your operating constraints, dynamically update your memory persona card.
<toolcall_update_persona>
{
  "content": "Fully rewritten persona content containing all known user preferences, facts, and communication styles..."
}
</toolcall_update_persona>

Tool 5: Create a Goal. Use this when the user asks to create, save, or pursue a concrete outcome.
<toolcall_create_goal>
{
  "title": "Goal title",
  "description": "What success means and relevant context",
  "status": "Active|Paused|Completed",
  "roadmap": {
    "knowledge": ["optional knowledge item"],
    "ideas": ["optional strategic idea"],
    "todos": ["optional actionable step"]
  }
}
</toolcall_create_goal>

Tool 6: Update an existing Goal or its roadmap panel. Use this when the user asks to edit a goal, change its status, revise its roadmap, or regenerate/rewrite panel content.
<toolcall_update_goal>
{
  "target": "existing goal title or id",
  "title": "optional new title",
  "description": "optional new description",
  "status": "Active|Paused|Completed",
  "roadmap": {
    "knowledge": ["complete replacement list when changing knowledge"],
    "ideas": ["complete replacement list when changing ideas"],
    "todos": ["complete replacement list when changing todos"]
  }
}
</toolcall_update_goal>

Tool 7: Delete an existing Project. Use this when the user explicitly asks to delete, remove, archive, or get rid of a project.
<toolcall_delete_project>
{
  "target": "existing project title or id"
}
</toolcall_delete_project>

Tool 8: Create a Fusion item. Use this when the user explicitly requests to synthesize notes/ideas/projects/goals into a written fusion, post, report, or thesis.
<toolcall_create_fusion>
{
  "title": "Fusion title",
  "type": "Post|Writing|Thesis|Report",
  "status": "Draft|Synthesizing|Ready|Completed",
  "summary": "Short abstract summary",
  "centralConclusion": "The core takeaway or conclusion",
  "body": "Markdown or text contents",
  "audience": "Personal|Team|Public|Client",
  "isPublic": false,
  "authorName": "optional author byline; omit to leave blank for the user to fill in later",
  "authorBio": "optional one-line author bio for the public fusion page",
  "linkedNotes": ["optional note content snippet or id"],
  "linkedIdeas": ["optional idea title or id"],
  "linkedGoals": ["optional goal title or id"],
  "linkedProjects": ["optional project title or id"]
}
</toolcall_create_fusion>

Tool 9: Update an existing Fusion item. Use this when the user asks to edit, revise, expand, retitle, mark ready/completed, or link material to an existing fusion.
<toolcall_update_fusion>
{
  "target": "existing fusion title or id",
  "updates": {
    "title": "optional new title",
    "type": "Post|Writing|Thesis|Report",
    "status": "Draft|Synthesizing|Ready|Completed",
    "summary": "optional replacement summary",
    "centralConclusion": "optional replacement conclusion",
    "body": "optional replacement body",
    "audience": "Personal|Team|Public|Client",
    "isPublic": true,
    "authorName": "optional updated byline",
    "authorBio": "optional updated bio",
    "linkedNotes": ["complete replacement note refs when changing note links"],
    "linkedIdeas": ["complete replacement idea refs when changing idea links"],
    "linkedGoals": ["complete replacement goal refs when changing goal links"],
    "linkedProjects": ["complete replacement project refs when changing project links"]
  }
}
</toolcall_update_fusion>

Tool 9b: Delete an existing Fusion item. Use this when the user explicitly asks to delete, remove, archive, or get rid of a fusion, post, report, or thesis.
<toolcall_delete_fusion>
{
  "target": "existing fusion title or id"
}
</toolcall_delete_fusion>

Tool 10: Create a Capability Bet (Incubation). Use this when the user asks you to track, monitor, or create a strategic capability bet on the incubation board.
<toolcall_create_capability_bet>
{
  "title": "Strategic bet title",
  "thesis": "Strategic thesis statement",
  "baselineConviction": 50,
  "thresholdToCommit": 80,
  "keywords": ["tag1", "tag2"],
  "unlockPaths": ["unlock milestone 1", "unlock milestone 2"],
  "firstUseCases": ["use case 1", "use case 2"],
  "costOfNotKnowing": "What happens if we do not build this?",
  "reviewCadence": "weekly|bi-weekly|monthly",
  "strategicNote": "strategic focus details"
}
</toolcall_create_capability_bet>

Tool 11: Update a Capability Bet (Incubation). Use this to update properties of a capability bet in incubation (like conviction, status, review cadence, thesis).
<toolcall_update_capability_bet>
{
  "target": "existing capability bet title or id",
  "updates": {
    "title": "optional new title",
    "thesis": "optional new thesis",
    "baselineConviction": 60,
    "status": "watching|exploring|preparing|committed",
    "thresholdToCommit": 85,
    "keywords": ["newtag1"],
    "unlockPaths": ["updated milestones"],
    "firstUseCases": ["updated use cases"],
    "costOfNotKnowing": "updated cost description",
    "reviewCadence": "weekly|bi-weekly|monthly",
    "strategicNote": "updated strategic notes"
  }
}
</toolcall_update_capability_bet>

Tool 12: Link existing notes to a Capability Bet. Use this when the user asks to connect, attach, or link inbox notes/signals/evidence to a bet. This creates/updates note evidence links; HumanBoard derives the bet signal counts from those notes.
<toolcall_link_notes_to_bet>
{
  "target": "existing capability bet title or id",
  "notes": ["note id or distinctive content snippet"],
  "polarity": "supports|contradicts|complicates",
  "summary": "optional evidence summary to store on the linked notes"
}
</toolcall_link_notes_to_bet>

When the user asks to create or manage a map idea node, prefer toolcall_create_idea or toolcall_update_idea instead of only describing what to do.
When the user asks to create or edit a goal or roadmap panel, use toolcall_create_goal or toolcall_update_goal instead of only describing what to do.
When the user explicitly asks to remove a project, use toolcall_delete_project instead of only describing what to do.
When the user asks to create, synthesize, or write a fusion, post, report, or thesis, use toolcall_create_fusion instead of only describing what to do or creating a regular idea.
When the user asks to edit an existing fusion, use toolcall_update_fusion.
When the user explicitly asks to remove or delete a fusion, post, report, or thesis, use toolcall_delete_fusion.
When the user asks to link notes or evidence to a capability bet, use toolcall_link_notes_to_bet.
Include the toolcall anywhere in your response. You can use multiple toolcalls if needed.`);

      const userPrompt = imageAnalysisResult
        ? `User uploaded an image "${imageToProcess?.name || 'image'}". Visual analysis / extracted content:\n---\n${imageAnalysisResult}\n---\nUser comment/instruction: ${userMsg || 'Please analyze this image.'}`
        : `User: ${userMsg}`;

      const responseText = await askGemma(
        `HumanBoard knowledge context:\n${relatedContext}\n\nPrevious conversation:\n${historyContext}${webContext}\n\n${userPrompt}`,
        systemInstruction
      );

      let cleanText = responseText;
      // If the LLM hit its output token limit mid-toolcall, the closing tag
      // is missing and the regex parser would silently drop the call. Detect
      // that up-front so we can surface a clear error and skip the partial
      // toolcall instead of letting the user see a hallucinated "I created
      // the fusion" success.
      const truncatedToolcallName = detectTruncatedToolcall(responseText);
      if (truncatedToolcallName) {
        recordDebugEvent({
          type: 'llm_truncated',
          label: `unclosed <toolcall_${truncatedToolcallName}>`,
          payload: {
            unclosedTag: truncatedToolcallName,
            responseChars: responseText.length,
          },
        });
      }
      const failedActions: string[] = [];
      if (truncatedToolcallName) {
        const err = `The AI response was cut off mid-toolcall (unclosed <toolcall_${truncatedToolcallName}>). ` +
          `This usually means the body or linked material was larger than the model's output budget. ` +
          `Try: (1) splitting the fusion into a shorter body with a link to a separate note containing the long form, ` +
          `or (2) using the Fusion editor directly for very large content.`;
        failedActions.push(err);
        console.warn(`[Chatbot] ${err}`);
      }
      let matchedNote = false;
      let matchedIdea = false;
      let matchedIdeaUpdate = false;
      let matchedGoal = false;
      let matchedGoalUpdate = false;
      let matchedProjectDelete = false;
      let matchedFusion = false;
      let matchedFusionUpdate = false;
      const allowNoteIdeaWrites = (autoDistill && autoDistillLevel !== 'off') || explicitBoardWrite;
      let blockedInferredWrite = false;

      // Extract Create Note tool calls
      const noteRegex = /<toolcall_create_note>([\s\S]*?)<\/toolcall_create_note>/gi;
      let noteMatch;
      while ((noteMatch = noteRegex.exec(responseText)) !== null) {
        const noteContent = noteMatch[1].trim();
        if (!allowNoteIdeaWrites && noteContent) {
          blockedInferredWrite = true;
          failedActions.push(
            `Inbox note was not saved because Auto-distill is off and the message did not explicitly ask to save. Toggle Auto-distill or say "save this as a note".`,
          );
        }
        if (allowNoteIdeaWrites && noteContent && shouldCaptureAsInboxContent(noteContent)) {
          addNote(noteContent);
          const created = useAppStore.getState().notes.find((note) => note.content === noteContent);
          if (created) matchedNote = true;
          else failedActions.push('Inbox note creation was requested but was not found after creation.');
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
          if (!allowNoteIdeaWrites) {
            blockedInferredWrite = true;
            failedActions.push(
              `Idea "${ideaData.title || 'Untitled AI Draft'}" was not created because Auto-distill is off and the message did not explicitly ask to save.`,
            );
            continue;
          }
          const title = ideaData.title || 'Untitled AI Draft';
          addIdea({
            title,
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
            incubationDecision: ideaData.incubationDecision,
            reviewCadence: ideaData.reviewCadence,
          });
          const created = useAppStore.getState().ideas.find((idea) => idea.title === title);
          if (created) matchedIdea = true;
          else failedActions.push(`Idea "${title}" was requested but was not found after creation.`);
        } catch (err) {
          console.error("Failed to parse create_idea toolcall JSON:", err);
          failedActions.push('Idea creation failed because the toolcall JSON could not be parsed.');
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
          if (!explicitBoardWrite) continue;
          const targetIdea = findIdeaByReference(ideaData.target);
          if (!targetIdea) {
            failedActions.push(`Idea "${ideaData.target || 'unknown'}" was not found.`);
            continue;
          }
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
            incubationDecision: ideaData.incubationDecision ?? targetIdea.incubationDecision,
            reviewCadence: ideaData.reviewCadence ?? targetIdea.reviewCadence,
          });
          const updated = useAppStore.getState().ideas.find((idea) => idea.id === targetIdea.id);
          if (updated && (ideaData.title === undefined || updated.title === String(ideaData.title))) matchedIdeaUpdate = true;
          else failedActions.push(`Idea "${targetIdea.title}" update was requested but could not be verified.`);
        } catch (err) {
          console.error("Failed to parse update_idea toolcall JSON:", err);
          failedActions.push('Idea update failed because the toolcall JSON could not be parsed.');
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

      const createGoalRegex = /<toolcall_create_goal>([\s\S]*?)<\/toolcall_create_goal>/gi;
      let createGoalMatch;
      while ((createGoalMatch = createGoalRegex.exec(responseText)) !== null) {
        try {
          const cleanJsonStr = createGoalMatch[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!String(data.title || '').trim()) continue;
          matchedGoal = true;
          addGoal({
            title: String(data.title).trim(),
            description: String(data.description || '').trim(),
            status: ['Active', 'Paused', 'Completed'].includes(data.status) ? data.status : 'Active',
            roadmap: data.roadmap ? {
              knowledge: Array.isArray(data.roadmap.knowledge) ? data.roadmap.knowledge.map(String) : [],
              ideas: Array.isArray(data.roadmap.ideas) ? data.roadmap.ideas.map(String) : [],
              todos: Array.isArray(data.roadmap.todos) ? data.roadmap.todos.map(String) : [],
            } : undefined,
          });
        } catch (err) {
          console.error("Failed to parse create_goal toolcall JSON:", err);
        }
      }
      cleanText = cleanText.replace(createGoalRegex, '').trim();

      const updateGoalRegex = /<toolcall_update_goal>([\s\S]*?)<\/toolcall_update_goal>/gi;
      let updateGoalMatch;
      while ((updateGoalMatch = updateGoalRegex.exec(responseText)) !== null) {
        try {
          const cleanJsonStr = updateGoalMatch[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          const targetGoal = findGoalByReference(data.target);
          if (!targetGoal) continue;
          matchedGoalUpdate = true;
          updateGoal(targetGoal.id, {
            title: data.title === undefined ? targetGoal.title : String(data.title).trim(),
            description: data.description === undefined ? targetGoal.description : String(data.description).trim(),
            status: ['Active', 'Paused', 'Completed'].includes(data.status) ? data.status : targetGoal.status,
            roadmap: data.roadmap ? {
              knowledge: Array.isArray(data.roadmap.knowledge) ? data.roadmap.knowledge.map(String) : targetGoal.roadmap?.knowledge ?? [],
              ideas: Array.isArray(data.roadmap.ideas) ? data.roadmap.ideas.map(String) : targetGoal.roadmap?.ideas ?? [],
              todos: Array.isArray(data.roadmap.todos) ? data.roadmap.todos.map(String) : targetGoal.roadmap?.todos ?? [],
            } : targetGoal.roadmap,
          });
        } catch (err) {
          console.error("Failed to parse update_goal toolcall JSON:", err);
        }
      }
      cleanText = cleanText.replace(updateGoalRegex, '').trim();

      const deleteProjectRegex = /<toolcall_delete_project>([\s\S]*?)<\/toolcall_delete_project>/gi;
      let deleteProjectMatch;
      while ((deleteProjectMatch = deleteProjectRegex.exec(responseText)) !== null) {
        try {
          const cleanJsonStr = deleteProjectMatch[1].trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!explicitBoardWrite) {
            failedActions.push(
              `Project deletion of "${data.target || 'unknown'}" was blocked because the message did not explicitly ask to delete/remove it.`,
            );
            continue;
          }
          const targetProject = findProjectByReference(data.target);
          if (!targetProject) {
            failedActions.push(`Project "${data.target || 'unknown'}" was not found for deletion.`);
            continue;
          }
          matchedProjectDelete = true;
          deleteProject(targetProject.id);
        } catch (err) {
          console.error("Failed to parse delete_project toolcall JSON:", err);
          failedActions.push('Project deletion failed because the toolcall JSON could not be parsed.');
        }
      }
      cleanText = cleanText.replace(deleteProjectRegex, '').trim();

      // Extract Create Fusion tool calls
      const fusionRegex = /<toolcall_create_fusion>([\s\S]*?)<\/toolcall_create_fusion>/gi;
      let fusionMatch;
      while ((fusionMatch = fusionRegex.exec(responseText)) !== null) {
        const jsonStr = fusionMatch[1].trim();
        const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        try {
          const fusionData = JSON.parse(cleanJsonStr);
          if (!allowNoteIdeaWrites) {
            blockedInferredWrite = true;
            failedActions.push(
              `Fusion "${fusionData.title || 'Untitled Fusion'}" was not created because Auto-distill is off and the message did not explicitly ask to save it. Toggle Auto-distill or phrase the request as "save a fusion" to enable writes.`,
            );
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_create_fusion',
              payload: {
                reason: 'gate-blocked',
                allowNoteIdeaWrites,
                explicitBoardWrite,
                title: fusionData.title,
              },
            });
            continue;
          }
          const title = asOptionalString(fusionData.title)?.trim() || 'Untitled Fusion';
          // Duplicate-by-title guard: if an existing fusion already has this
          // title, route the request to update_fusion instead of creating a
          // duplicate. The model can still ask to update by id via
          // toolcall_update_fusion directly.
          const duplicate = findFusionByReference(title);
          if (duplicate) {
            failedActions.push(
              `Fusion "${title}" already exists (id ${duplicate.id}); not creating a duplicate. Use toolcall_update_fusion with target="${title}" to edit it.`,
            );
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_create_fusion',
              payload: {
                reason: 'duplicate-title',
                title,
                existingId: duplicate.id,
              },
            });
            continue;
          }
          const isPublic = typeof fusionData.isPublic === 'boolean' ? fusionData.isPublic : false;
          const newId = addFusionItem({
            title,
            type: normalizeFusionType(fusionData.type),
            status: normalizeFusionStatus(fusionData.status),
            summary: asOptionalString(fusionData.summary) ?? '',
            centralConclusion: asOptionalString(fusionData.centralConclusion) ?? '',
            body: asOptionalString(fusionData.body) ?? '',
            audience: normalizeFusionAudience(fusionData.audience),
            isPublic,
            authorName: asOptionalString(fusionData.authorName)?.trim() || undefined,
            authorBio: asOptionalString(fusionData.authorBio)?.trim() || undefined,
            linkedNoteIds: findRelatedNoteIds(fusionData.linkedNotes),
            linkedIdeaIds: findRelatedIdeaIds(fusionData.linkedIdeas),
            linkedGoalIds: findRelatedGoalIds(fusionData.linkedGoals),
            linkedProjectIds: findRelatedProjectIds(fusionData.linkedProjects),
          });
          // Verify by id (not by title — title collisions are now possible
          // because we no-op'd on the duplicate path above).
          const created = useAppStore.getState().fusionItems.find((item) => item.id === newId);
          if (created) {
            matchedFusion = true;
            recordDebugEvent({
              type: 'toolcall_applied',
              label: 'toolcall_create_fusion',
              payload: {
                newId,
                title,
                bodyChars: (fusionData.body || '').length,
                summaryChars: (fusionData.summary || '').length,
                conclusionChars: (fusionData.centralConclusion || '').length,
              },
            });
          }
          else failedActions.push(`Fusion "${title}" was created with id ${newId} but could not be re-read from the store.`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Failed to parse create_fusion toolcall JSON:", err);
          failedActions.push('Fusion creation failed because the toolcall JSON could not be parsed.');
          recordDebugEvent({
            type: 'toolcall_failed',
            label: 'toolcall_create_fusion',
            payload: {
              reason: 'json-parse-error',
              jsonChars: jsonStr.length,
              jsonPreview: cleanJsonStr.slice(0, 200),
            },
            error: message,
          });
        }
      }
      cleanText = cleanText.replace(fusionRegex, '').trim();

      // Extract Update Fusion tool calls
      const updateFusionRegex = /<toolcall_update_fusion>([\s\S]*?)<\/toolcall_update_fusion>/gi;
      let updateFusionMatch;
      while ((updateFusionMatch = updateFusionRegex.exec(responseText)) !== null) {
        const jsonStr = updateFusionMatch[1].trim();
        const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        try {
          const data = JSON.parse(cleanJsonStr);
          if (!explicitBoardWrite) {
            blockedInferredWrite = true;
            failedActions.push(
              `Fusion update on "${data.target || 'unknown'}" was blocked because the message did not explicitly ask to save/edit/update. Phrase the request as "update the X fusion" or "edit my fusion" to enable writes.`,
            );
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_update_fusion',
              payload: {
                reason: 'gate-blocked',
                explicitBoardWrite,
                target: data.target,
              },
            });
            continue;
          }
          const targetFusion = findFusionByReference(data.target);
          if (!targetFusion) {
            failedActions.push(`Fusion "${data.target || 'unknown'}" was not found.`);
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_update_fusion',
              payload: {
                reason: 'target-not-found',
                target: data.target,
                existingFusions: fusionItems.map((f) => f.title).slice(0, 12),
              },
            });
            continue;
          }
          const updates = data.updates || {};

          // Resolve linked refs up-front so we can surface dropped references.
          const linkedNoteIds = Array.isArray(updates.linkedNotes) ? findRelatedNoteIds(updates.linkedNotes) : undefined;
          const linkedIdeaIds = Array.isArray(updates.linkedIdeas) ? findRelatedIdeaIds(updates.linkedIdeas) : undefined;
          const linkedGoalIds = Array.isArray(updates.linkedGoals) ? findRelatedGoalIds(updates.linkedGoals) : undefined;
          const linkedProjectIds = Array.isArray(updates.linkedProjects) ? findRelatedProjectIds(updates.linkedProjects) : undefined;

          const droppedNotes = Array.isArray(updates.linkedNotes)
            ? updates.linkedNotes.length - (linkedNoteIds?.length ?? 0)
            : 0;
          const droppedIdeas = Array.isArray(updates.linkedIdeas)
            ? updates.linkedIdeas.length - (linkedIdeaIds?.length ?? 0)
            : 0;
          const droppedGoals = Array.isArray(updates.linkedGoals)
            ? updates.linkedGoals.length - (linkedGoalIds?.length ?? 0)
            : 0;
          const droppedProjects = Array.isArray(updates.linkedProjects)
            ? updates.linkedProjects.length - (linkedProjectIds?.length ?? 0)
            : 0;
          const totalDropped = droppedNotes + droppedIdeas + droppedGoals + droppedProjects;
          if (totalDropped > 0) {
            failedActions.push(
              `Fusion "${targetFusion.title}": ${totalDropped} linked reference(s) could not be matched and were dropped (notes=${droppedNotes}, ideas=${droppedIdeas}, goals=${droppedGoals}, projects=${droppedProjects}).`,
            );
          }

          const nextUpdates: Record<string, unknown> = {};
          if (updates.title !== undefined) nextUpdates.title = String(updates.title);
          if (updates.type !== undefined) nextUpdates.type = normalizeFusionType(updates.type);
          if (updates.status !== undefined) nextUpdates.status = normalizeFusionStatus(updates.status);
          if (updates.summary !== undefined) nextUpdates.summary = String(updates.summary);
          if (updates.centralConclusion !== undefined) nextUpdates.centralConclusion = String(updates.centralConclusion);
          if (updates.body !== undefined) nextUpdates.body = String(updates.body);
          if (updates.audience !== undefined) nextUpdates.audience = normalizeFusionAudience(updates.audience);
          if (typeof updates.isPublic === 'boolean') nextUpdates.isPublic = updates.isPublic;
          if (updates.authorName !== undefined) nextUpdates.authorName = String(updates.authorName).trim() || undefined;
          if (updates.authorBio !== undefined) nextUpdates.authorBio = String(updates.authorBio).trim() || undefined;
          if (linkedNoteIds !== undefined) nextUpdates.linkedNoteIds = linkedNoteIds;
          if (linkedIdeaIds !== undefined) nextUpdates.linkedIdeaIds = linkedIdeaIds;
          if (linkedGoalIds !== undefined) nextUpdates.linkedGoalIds = linkedGoalIds;
          if (linkedProjectIds !== undefined) nextUpdates.linkedProjectIds = linkedProjectIds;

          // No-op guard 1: the model emitted a toolcall with no changeable
          // fields. This usually means the model is hallucinating the
          // update (e.g. it rewrote only the prose and forgot the JSON).
          if (Object.keys(nextUpdates).length === 0) {
            failedActions.push(
              `Fusion "${targetFusion.title}" update was requested but the toolcall contained no changeable fields. ` +
              `The model may have hallucinated the update — try rephrasing the request with explicit fields to change.`,
            );
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_update_fusion',
              payload: {
                reason: 'empty-updates',
                targetId: targetFusion.id,
                targetTitle: targetFusion.title,
                rawUpdatesKeys: Object.keys(updates),
              },
            });
            continue;
          }

          // Snapshot the current values of the fields we're about to change
          // so we can verify the update actually mutated them — not just
          // bumped `updatedAt`. This catches the "I marked it Ready but
          // it was already Ready" / "I added note X but the title was
          // already X" failure modes where the bot claims success but
          // nothing visible changed.
          const before: Record<string, unknown> = {};
          for (const key of Object.keys(nextUpdates)) {
            before[key] = (targetFusion as unknown as Record<string, unknown>)[key];
          }

          updateFusionItem(targetFusion.id, nextUpdates);
          const updated = useAppStore.getState().fusionItems.find((item) => item.id === targetFusion.id);
          if (!updated) {
            failedActions.push(`Fusion "${targetFusion.title}" update could not be verified in the store.`);
            recordDebugEvent({
              type: 'toolcall_failed',
              label: 'toolcall_update_fusion',
              payload: { reason: 'post-update-not-found', targetId: targetFusion.id },
            });
            continue;
          }
          if (updates.title !== undefined && updated.title !== String(updates.title)) {
            failedActions.push(`Fusion title update was rejected by the store (current: "${updated.title}").`);
            recordDebugEvent({
              type: 'toolcall_failed',
              label: 'toolcall_update_fusion',
              payload: { reason: 'title-rejected', targetId: targetFusion.id, currentTitle: updated.title },
            });
            continue;
          }

          // No-op guard 2: every value the model supplied already matched
          // the current state. Surfacing this stops the chatbot from
          // telling the user "done" when nothing actually moved.
          const after: Record<string, unknown> = {};
          for (const key of Object.keys(nextUpdates)) {
            after[key] = (updated as unknown as Record<string, unknown>)[key];
          }
          const changedFields = diffFusionFields(before, after, nextUpdates);
          if (changedFields.length === 0) {
            failedActions.push(
              `Fusion "${targetFusion.title}" update was a no-op: the values supplied by the model already match the current state ` +
              `for [${Object.keys(nextUpdates).join(', ')}]. The chatbot said it updated the fusion but nothing actually changed. ` +
              `Try a more specific instruction, e.g. "add concrete details about X" or "rewrite the conclusion to emphasize Y".`,
            );
            recordDebugEvent({
              type: 'toolcall_skipped',
              label: 'toolcall_update_fusion',
              payload: {
                reason: 'no-op-diffs',
                targetId: targetFusion.id,
                targetTitle: targetFusion.title,
                nextUpdatesKeys: Object.keys(nextUpdates),
                before,
                after,
              },
            });
            continue;
          }
          matchedFusionUpdate = true;
          recordDebugEvent({
            type: 'toolcall_applied',
            label: 'toolcall_update_fusion',
            payload: {
              targetId: targetFusion.id,
              targetTitle: targetFusion.title,
              changedFields,
              bodyChars: typeof updates.body === 'string' ? updates.body.length : undefined,
              summaryChars: typeof updates.summary === 'string' ? updates.summary.length : undefined,
              conclusionChars: typeof updates.centralConclusion === 'string' ? updates.centralConclusion.length : undefined,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Failed to parse update_fusion toolcall JSON:", err);
          failedActions.push('Fusion update failed because the toolcall JSON could not be parsed.');
          recordDebugEvent({
            type: 'toolcall_failed',
            label: 'toolcall_update_fusion',
            payload: { reason: 'json-parse-error', jsonChars: jsonStr.length, jsonPreview: cleanJsonStr.slice(0, 200) },
            error: message,
          });
        }
      }
      cleanText = cleanText.replace(updateFusionRegex, '').trim();

      // Extract Delete Fusion tool calls
      const deleteFusionRegex = /<toolcall_delete_fusion>([\s\S]*?)<\/toolcall_delete_fusion>/gi;
      let deleteFusionMatch;
      let matchedFusionDelete = false;
      while ((deleteFusionMatch = deleteFusionRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = deleteFusionMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!explicitBoardWrite) {
            failedActions.push(
              `Fusion deletion of "${data.target || 'unknown'}" was blocked because the message did not explicitly ask to delete/remove it.`,
            );
            continue;
          }
          const targetFusion = findFusionByReference(data.target);
          if (!targetFusion) {
            failedActions.push(`Fusion "${data.target || 'unknown'}" was not found for deletion.`);
            continue;
          }
          deleteFusionItem(targetFusion.id);
          const stillThere = useAppStore.getState().fusionItems.find((item) => item.id === targetFusion.id);
          if (!stillThere) matchedFusionDelete = true;
          else failedActions.push(`Fusion "${targetFusion.title}" deletion could not be verified.`);
        } catch (err) {
          console.error("Failed to parse delete_fusion toolcall JSON:", err);
          failedActions.push('Fusion deletion failed because the toolcall JSON could not be parsed.');
        }
      }
      cleanText = cleanText.replace(deleteFusionRegex, '').trim();

      // Extract Create Capability Bet tool calls
      const createBetRegex = /<toolcall_create_capability_bet>([\s\S]*?)<\/toolcall_create_capability_bet>/gi;
      let createBetMatch;
      let matchedCapabilityBet = false;
      while ((createBetMatch = createBetRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = createBetMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!allowNoteIdeaWrites) {
            blockedInferredWrite = true;
            failedActions.push(
              `Capability Bet "${data.title || 'Untitled Capability Bet'}" was not created because Auto-distill is off and the message did not explicitly ask to save it.`,
            );
            continue;
          }
          const title = data.title || 'Untitled Capability Bet';
          addCapabilityBet({
            title,
            thesis: data.thesis || '',
            baselineConviction: Number.isFinite(data.baselineConviction) ? Number(data.baselineConviction) : 50,
            thresholdToCommit: Number.isFinite(data.thresholdToCommit) ? Number(data.thresholdToCommit) : 80,
            keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
            unlockPaths: Array.isArray(data.unlockPaths) ? data.unlockPaths.map(String) : [],
            firstUseCases: Array.isArray(data.firstUseCases) ? data.firstUseCases.map(String) : [],
            costOfNotKnowing: data.costOfNotKnowing || '',
            reviewCadence: data.reviewCadence || '',
            strategicNote: data.strategicNote || '',
          });
          const created = useAppStore.getState().capabilityBets.find((bet) => bet.title === title);
          if (created) matchedCapabilityBet = true;
          else failedActions.push(`Capability Bet "${title}" was requested but was not found after creation.`);
        } catch (err) {
          console.error("Failed to parse create_capability_bet toolcall JSON:", err);
          failedActions.push('Capability Bet creation failed because the toolcall JSON could not be parsed.');
        }
      }
      cleanText = cleanText.replace(createBetRegex, '').trim();

      // Extract Update Capability Bet tool calls
      const updateBetRegex = /<toolcall_update_capability_bet>([\s\S]*?)<\/toolcall_update_capability_bet>/gi;
      let updateBetMatch;
      let matchedCapabilityBetUpdate = false;
      while ((updateBetMatch = updateBetRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = updateBetMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!explicitBoardWrite) continue;
          const targetBet = findCapabilityBetByReference(data.target);
          if (!targetBet) {
            failedActions.push(`Capability Bet "${data.target || 'unknown'}" was not found.`);
            continue;
          }
          const updates = data.updates || {};
          updateCapabilityBet(targetBet.id, {
            title: updates.title || targetBet.title,
            thesis: updates.thesis || targetBet.thesis,
            baselineConviction: Number.isFinite(updates.baselineConviction) ? Number(updates.baselineConviction) : targetBet.baselineConviction,
            status: updates.status || targetBet.status,
            thresholdToCommit: Number.isFinite(updates.thresholdToCommit) ? Number(updates.thresholdToCommit) : targetBet.thresholdToCommit,
            keywords: Array.isArray(updates.keywords) ? updates.keywords.map(String) : targetBet.keywords,
            unlockPaths: Array.isArray(updates.unlockPaths) ? updates.unlockPaths.map(String) : targetBet.unlockPaths,
            firstUseCases: Array.isArray(updates.firstUseCases) ? updates.firstUseCases.map(String) : targetBet.firstUseCases,
            costOfNotKnowing: updates.costOfNotKnowing !== undefined ? updates.costOfNotKnowing : targetBet.costOfNotKnowing,
            reviewCadence: updates.reviewCadence !== undefined ? updates.reviewCadence : targetBet.reviewCadence,
            strategicNote: updates.strategicNote !== undefined ? updates.strategicNote : targetBet.strategicNote,
          });
          const updated = useAppStore.getState().capabilityBets.find((bet) => bet.id === targetBet.id);
          if (updated) matchedCapabilityBetUpdate = true;
          else failedActions.push(`Capability Bet "${targetBet.title}" update was requested but could not be verified.`);
        } catch (err) {
          console.error("Failed to parse update_capability_bet toolcall JSON:", err);
          failedActions.push('Capability Bet update failed because the toolcall JSON could not be parsed.');
        }
      }
      cleanText = cleanText.replace(updateBetRegex, '').trim();

      // Extract Link Notes to Capability Bet tool calls
      const linkNotesToBetRegex = /<toolcall_link_notes_to_bet>([\s\S]*?)<\/toolcall_link_notes_to_bet>/gi;
      let linkNotesToBetMatch;
      let matchedNoteBetLinks = false;
      while ((linkNotesToBetMatch = linkNotesToBetRegex.exec(responseText)) !== null) {
        try {
          const jsonStr = linkNotesToBetMatch[1].trim();
          const cleanJsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
          const data = JSON.parse(cleanJsonStr);
          if (!explicitBoardWrite) {
            blockedInferredWrite = true;
            continue;
          }
          const targetBet = findCapabilityBetByReference(data.target);
          if (!targetBet) {
            failedActions.push(`Capability Bet "${data.target || 'unknown'}" was not found for note linking.`);
            continue;
          }
          const noteRefs = Array.isArray(data.notes) ? data.notes.map(String) : [];
          const targetNotes = noteRefs.map((ref) => findNoteByReference(ref)).filter((note): note is typeof notes[number] => Boolean(note));
          if (targetNotes.length === 0) {
            failedActions.push(`No matching notes were found to link to "${targetBet.title}".`);
            continue;
          }
          const polarity = ['supports', 'contradicts', 'complicates'].includes(data.polarity) ? data.polarity : 'supports';
          for (const note of targetNotes) {
            updateNote(note.id, {
              capabilityBetIds: [...new Set([...(note.capabilityBetIds || []), targetBet.id])],
              capabilityEvidencePolarity: polarity,
              capabilityEvidenceSummary: data.summary ? String(data.summary) : note.capabilityEvidenceSummary,
            });
          }
          const state = useAppStore.getState();
          const verifiedCount = targetNotes.filter((note) => state.notes.find((candidate) => candidate.id === note.id)?.capabilityBetIds?.includes(targetBet.id)).length;
          if (verifiedCount === targetNotes.length) matchedNoteBetLinks = true;
          else failedActions.push(`Only ${verifiedCount}/${targetNotes.length} note links to "${targetBet.title}" could be verified.`);
        } catch (err) {
          console.error("Failed to parse link_notes_to_bet toolcall JSON:", err);
          failedActions.push('Linking notes to a bet failed because the toolcall JSON could not be parsed.');
        }
      }
      cleanText = cleanText.replace(linkNotesToBetRegex, '').trim();

      // Hallucination detector: the LLM's prose describes an action
      // (update / create / save / add / mark / set / etc.) but no
      // matching toolcall was actually parsed. This is the "the bot
      // said it updated the fusion but the JSON block is missing"
      // failure mode that the user kept hitting. Surface it loudly so
      // the user knows the prose was a hallucination, not a real write.
      if (
        explicitBoardWrite &&
        !matchedNote && !matchedIdea && !matchedIdeaUpdate && !matchedPersona &&
        !matchedGoal && !matchedGoalUpdate && !matchedProjectDelete &&
        !matchedFusion && !matchedFusionUpdate && !matchedFusionDelete &&
        !matchedCapabilityBet && !matchedCapabilityBetUpdate && !matchedNoteBetLinks &&
        !blockedInferredWrite &&
        cleanText
      ) {
        const claimKeywords = /\b(updated|created|saved|added|marked|set|changed|edited|removed|deleted|drafted|wrote|rewrote|expanded|captured|noted|appended|populated|filled)\b/i;
        if (claimKeywords.test(cleanText)) {
          failedActions.push(
            `The chatbot said it performed an action in its reply but no toolcall was actually emitted in the response. ` +
            `This is a model hallucination: the prose claims the action but the JSON toolcall is missing or unparseable. ` +
            `Try rephrasing with an explicit request that includes the field to change, e.g. ` +
            `"use the toolcall_update_fusion tool to set body to ...". ` +
            `If the model keeps doing this, you can also paste the body text directly into the Fusion editor.`,
          );
        } else {
          // No action verb at all — the LLM just didn't do anything.
          failedActions.push(
            `The user message asked to save/edit/update something, but the chatbot reply did not contain a toolcall. ` +
            `The chatbot may have been confused, or the LLM decided no action was appropriate. ` +
            `Try rephrasing or use the Fusion editor directly.`,
          );
        }
      }

      let actionMessage = '';
      if (matchedNote || matchedIdea || matchedIdeaUpdate || matchedPersona || matchedGoal || matchedGoalUpdate || matchedProjectDelete || matchedFusion || matchedFusionUpdate || matchedFusionDelete || matchedCapabilityBet || matchedCapabilityBetUpdate || matchedNoteBetLinks || failedActions.length) {
        actionMessage = "\n\n*(AI: ";
        const acts = [];
        if (matchedNote) acts.push("added to Inbox");
        if (matchedIdea) acts.push("created Idea node");
        if (matchedIdeaUpdate) acts.push("updated Idea node");
        if (matchedPersona) acts.push("updated System Persona");
        if (matchedGoal) acts.push("created Goal");
        if (matchedGoalUpdate) acts.push("updated Goal panel");
        if (matchedProjectDelete) acts.push("deleted Project");
        if (matchedFusion) acts.push("created Fusion item");
        if (matchedFusionUpdate) acts.push("updated Fusion item");
        if (matchedFusionDelete) acts.push("deleted Fusion item");
        if (matchedCapabilityBet) acts.push("created Capability Bet");
        if (matchedCapabilityBetUpdate) acts.push("updated Capability Bet");
        if (matchedNoteBetLinks) acts.push("linked notes to Capability Bet");
        if (failedActions.length) acts.push(`failed: ${failedActions.join(' | ')}`);
        actionMessage += (acts.length ? acts.join(", ") : "no writes verified") + ")*";
      }

      const currentMessages = useAppStore.getState().chatMessages;
      setChatMessages([...currentMessages, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: (cleanText || (blockedInferredWrite ? "I kept this in the conversation because Auto-distill is off." : "I have saved that to your board.")) + actionMessage,
        createdAt: new Date().toISOString()
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      const detail = error instanceof Error ? error.message : 'Unknown AI runtime error.';
      const currentMessages = useAppStore.getState().chatMessages;
      setChatMessages([...currentMessages, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: `AI runtime error: ${detail}`,
        createdAt: new Date().toISOString()
      }]);
    } finally {
      setWebReadingStatus(null);
      setIsLoading(false);
    }
  };

  // Filter threads based on search query
  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return chatThreads;
    const q = searchQuery.toLowerCase();
    return chatThreads.filter(t => 
      t.title.toLowerCase().includes(q) || 
      t.messages.some(m => m.content.toLowerCase().includes(q))
    );
  }, [chatThreads, searchQuery]);

  const handleStartRename = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(id);
    setEditTitleInput(title);
  };

  const handleSaveRename = (id: string) => {
    if (editTitleInput.trim()) {
      renameChatThread(id, editTitleInput.trim());
    }
    setEditingThreadId(null);
  };

  const handleNewChat = () => {
    const newId = createChatThread();
    setActiveThreadId(newId);
    setSearchQuery('');
    if (!isExpanded) {
      setIsSidebarOpen(false);
    }
  };

  const activeThread = useMemo(() => chatThreads.find(t => t.id === activeThreadId), [chatThreads, activeThreadId]);
  const activeTitle = activeThread ? activeThread.title : 'HumanBoard Assistant';

  if (!isOpen) {
    return (
      <div data-tour="tour-chatbot-button" className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50 flex items-center gap-3 pointer-events-none">
        {showCta && (
          <div 
            onClick={() => {
              setIsOpen(true);
              setShowCta(false);
              try {
                sessionStorage.setItem('hb_hide_cta', 'true');
              } catch {}
            }}
            className="relative pointer-events-auto hidden sm:flex bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border border-stone-200/80 dark:border-stone-850 text-stone-850 dark:text-stone-250 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold cursor-pointer select-none max-w-xs transition-all hover:scale-[1.02] items-center gap-2 pr-9 animate-fade-in"
          >
            <span className="text-sm shrink-0">💬</span>
            <span className="leading-snug">Chat with AI: Got a raw thought or contradiction? Let's unpack it.</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowCta(false);
                try {
                  sessionStorage.setItem('hb_hide_cta', 'true');
                } catch {}
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-250 transition-colors cursor-pointer"
              aria-label="Dismiss greeting"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <button
          onClick={() => {
            setIsOpen(true);
            setShowCta(false);
            try {
              sessionStorage.setItem('hb_hide_cta', 'true');
            } catch {}
          }}
          className="pointer-events-auto w-12 h-12 bg-stone-900 dark:bg-stone-800 text-white dark:text-stone-100 rounded-full flex items-center justify-center shadow-lg hover:bg-stone-700 dark:hover:bg-stone-700 transition-transform hover:scale-105 cursor-pointer"
        >
          <Bot className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "fixed z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-2xl flex transition-all duration-300 ease-in-out overflow-hidden bottom-3 right-3 left-3 max-w-[calc(100vw-1.5rem)] md:left-auto md:bottom-6 md:right-6",
        isExpanded
          ? "h-[85vh] md:w-[760px] md:h-[800px] rounded-xl"
          : "w-full h-[70vh] md:w-[400px] md:h-[600px] rounded-2xl"
      )}
    >
      {/* Sidebar Overlay Backdrop (compact mode only) */}
      {!isExpanded && isSidebarOpen && (
        <div 
          className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm z-30 transition-opacity cursor-pointer"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar Panel */}
      <div 
        className={cn(
          "w-[240px] bg-stone-50 dark:bg-stone-950 border-r border-stone-150 dark:border-stone-850 flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out z-40 select-none",
          isExpanded 
            ? "relative translate-x-0" 
            : cn(
                "absolute top-0 bottom-0 left-0 shadow-2xl",
                isSidebarOpen ? "translate-x-0" : "-translate-x-full"
              )
        )}
      >
        {/* Sidebar Header: "New Chat" and "Close" for drawer */}
        <div className="p-3 border-b border-stone-150 dark:border-stone-850 flex items-center gap-2 justify-between">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-stone-900 hover:bg-stone-850 dark:bg-stone-100 dark:hover:bg-stone-200 text-white dark:text-stone-900 font-semibold text-xs rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Chat
          </button>
          {!isExpanded && (
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 hover:bg-stone-200 dark:hover:bg-stone-850 text-stone-500 rounded-lg transition-colors cursor-pointer"
              aria-label="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sidebar Search */}
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats..."
              className="w-full bg-stone-200/50 dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-xl py-1.5 pl-8 pr-7 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 p-0.5 rounded-full"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Chat List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 space-y-1">
          {filteredThreads.length === 0 ? (
            <div className="text-center py-8 text-xs text-stone-400">
              {searchQuery ? 'No matching chats' : 'No chats yet'}
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const isActive = thread.id === activeThreadId;
              const isEditing = thread.id === editingThreadId;

              return (
                <div
                  key={thread.id}
                  onClick={() => {
                    if (!isEditing) {
                      setActiveThreadId(thread.id);
                      if (!isExpanded) {
                        setIsSidebarOpen(false);
                      }
                    }
                  }}
                  className={cn(
                    "group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium cursor-pointer transition-all duration-150 select-none",
                    isActive
                      ? "bg-stone-200/80 dark:bg-stone-850 text-stone-900 dark:text-stone-100 shadow-sm"
                      : "text-stone-600 dark:text-stone-400 hover:bg-stone-150/60 dark:hover:bg-stone-900/40 hover:text-stone-900 dark:hover:text-stone-200"
                  )}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitleInput}
                        onChange={(e) => setEditTitleInput(e.target.value)}
                        onBlur={() => handleSaveRename(thread.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveRename(thread.id);
                          if (e.key === 'Escape') setEditingThreadId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded px-1.5 py-0.5 text-xs text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-1 focus:ring-stone-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveRename(thread.id)}
                        className="p-1 text-emerald-600 hover:text-emerald-700 dark:text-emerald-500"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="truncate pr-8 leading-snug">{thread.title}</span>
                      
                      {/* Hover actions */}
                      <div 
                        className={cn(
                          "absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pl-4 py-1.5 rounded-r-xl",
                          isActive ? "bg-stone-200 dark:bg-stone-850" : "bg-stone-50 dark:bg-stone-950 group-hover:bg-stone-150/80 dark:group-hover:bg-stone-900"
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleStartRename(thread.id, thread.title, e)}
                          className="p-1 rounded hover:bg-stone-200/75 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                          title="Rename thread"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this conversation?')) {
                              deleteChatThread(thread.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Delete thread"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative bg-white dark:bg-stone-900">
        {/* Chat Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-100 dark:border-stone-850 bg-stone-50/50 dark:bg-stone-950/20 select-none">
          <div className="flex flex-col gap-1 text-stone-800 dark:text-stone-200 font-medium text-sm min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {/* Menu icon to toggle sidebar in compact mode */}
              {!isExpanded && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-1 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors text-stone-500 cursor-pointer mr-1"
                  aria-label="Toggle sidebar"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}
              <Bot className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="truncate font-semibold tracking-tight leading-none" title={activeTitle}>
                {activeTitle}
              </span>
            </div>
            <div className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
              AI: {runtime.model} · {runtime.local ? 'local runtime' : runtime.baseUrl}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoDistill}
              onClick={toggleAutoDistill}
              className="mt-1 inline-flex w-fit items-center gap-2 text-[11px] font-medium text-stone-500 dark:text-stone-400 transition-colors hover:text-stone-800 dark:hover:text-stone-250 cursor-pointer"
              title="Selectively save durable insights as cleaned notes or ideas"
            >
              <span className={cn("relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors", autoDistill ? "bg-emerald-500" : "bg-stone-300 dark:bg-stone-700")}>
                <span className={cn("absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform", autoDistill ? "translate-x-3.5" : "translate-x-0.5")} />
              </span>
              Auto-distill {autoDistill ? 'on' : 'off'}
            </button>
          </div>
          <div className="flex items-center gap-1 text-stone-400">
            <button type="button" onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors cursor-pointer">
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-md transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 bg-white dark:bg-stone-900">
          {displayedMessages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                msg.role === 'user' 
                  ? "bg-stone-900 dark:bg-stone-800 text-white dark:text-white rounded-br-sm" 
                  : "bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-bl-sm prose prose-sm prose-stone dark:prose-invert"
              )}>
                {msg.role === 'user' ? (
                  <div className="space-y-2">
                    {msg.imageUrl && (
                      <div className="max-w-[200px] rounded-lg overflow-hidden border border-stone-200 dark:border-stone-800 bg-white/5 shadow-md">
                        <img src={msg.imageUrl} alt="User attachment" className="w-full h-auto object-cover max-h-[160px]" />
                      </div>
                    )}
                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                  </div>
                ) : (
                  <>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                    <div className="mt-3 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => handleSaveMessage(msg)}
                        disabled={savedMessageIds.includes(msg.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 transition-colors hover:border-stone-400 dark:hover:border-stone-500 hover:text-stone-800 dark:hover:text-stone-200 disabled:cursor-default disabled:opacity-70 cursor-pointer"
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
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-300 rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-400 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-1.5 h-1.5 bg-stone-400 dark:bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-stone-100 dark:border-stone-850 bg-white dark:bg-stone-900">
          {pendingImagePreview && (
            <div className="mb-3 flex items-center gap-3 bg-stone-50 dark:bg-stone-950 p-2 rounded-xl border border-stone-200/60 dark:border-stone-800/60 relative">
              <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-stone-200 dark:border-stone-850 bg-white dark:bg-stone-900 flex-shrink-0">
                <img src={pendingImagePreview} alt="Pending attachment" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={clearPendingImage}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-stone-950/60 hover:bg-stone-950 text-white transition-colors cursor-pointer"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider">Pending Attachment</div>
                <div className="text-xs text-stone-600 dark:text-stone-300 truncate">{pendingImage?.name}</div>
              </div>
              {isAnalyzingImage && (
                <Loader2 className="w-4 h-4 animate-spin text-stone-500" />
              )}
            </div>
          )}
          {imageError && (
            <div className="mb-3 px-3 py-2 border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-400 rounded-xl flex items-center justify-between gap-2">
              <span className="truncate">{imageError}</span>
              <button type="button" onClick={() => setImageError(null)} className="text-red-400 hover:text-red-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {webReadingStatus && (
            <div className="mb-3 px-3 py-2 border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/30 text-xs text-stone-600 dark:text-stone-300 rounded-xl flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{webReadingStatus}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
            <label className="cursor-pointer p-2 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-850 dark:hover:text-stone-200 transition-colors flex-shrink-0">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => stageImage(e.target.files?.[0])}
                disabled={isAnalyzingImage || isLoading}
              />
              <ImageIcon className="w-4 h-4" />
            </label>
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const image = getClipboardImage(e.clipboardData);
                  if (image) {
                    e.preventDefault();
                    stageImage(image);
                  }
                }}
                placeholder="Ask anything, paste a URL, or paste image..."
                autoCapitalize="sentences"
                autoCorrect="on"
                spellCheck
                className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-full py-2.5 pl-4 pr-12 text-sm text-stone-900 dark:text-stone-100 caret-stone-900 dark:caret-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 dark:focus:ring-stone-100/10 focus:border-stone-400 dark:focus:border-stone-600"
                style={{ WebkitTextFillColor: 'inherit' }}
                disabled={isAnalyzingImage || isLoading}
              />
              <button 
                type="submit"
                disabled={(!input.trim() && !pendingImage) || isAnalyzingImage || isLoading}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-full hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isAnalyzingImage || isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
