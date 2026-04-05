import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { ArrowLeft, Sparkles, Volume2, Image as ImageIcon, GitBranch, FlaskConical, CheckCircle2, Folder, Scale, Wand2, Type, AlignLeft, Zap, RefreshCw, Check, X, MessageSquare, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI, Modality } from '@google/genai';
import { performAIAction, AIAction } from '../lib/ai';
import { motion, AnimatePresence } from 'motion/react';

export default function IdeaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { ideas, sections, updateIdea } = useAppStore();
  const idea = ideas.find(i => i.id === id);
  const section = sections.find(s => s.id === idea?.sectionId);

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(idea?.content || '');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isPerformingAI, setIsPerformingAI] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  const [selection, setSelection] = useState<{ text: string, top: number, left: number } | null>(null);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  
  const [activeBlockMenu, setActiveBlockMenu] = useState<{ text: string, top: number, left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveBlockMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isAddingComment) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.toString().trim().length === 0) {
          setSelection(null);
        }
      }, 10);
    };

    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isAddingComment]);

  const handleMouseUp = () => {
    if (isEditing) return;
    setTimeout(() => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelection({
          text: sel.toString().trim(),
          top: rect.top - 10,
          left: rect.left + rect.width / 2,
        });
      } else {
        if (!isAddingComment) {
          setSelection(null);
        }
      }
    }, 10);
  };

  if (!idea) {
    return <div className="p-8 text-stone-500">Idea not found.</div>;
  }

  const handleSave = () => {
    updateIdea(idea.id, { content });
    setIsEditing(false);
  };

  const handleTTS = async () => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play();
      return;
    }

    setIsGeneratingAudio(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Idea Title: ${idea.title}. Summary: ${idea.summary}. Content: ${idea.content}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const binary = atob(base64Audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/pcm;rate=24000' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        const audio = new Audio(url);
        audio.play();
      }
    } catch (error) {
      console.error("TTS Error:", error);
      alert("Failed to generate audio.");
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handleGenerateImage = async () => {
    // ... existing code ...
  };

  const handleAIAction = async (action: AIAction) => {
    setIsPerformingAI(true);
    setAiResult(null);
    try {
      const result = await performAIAction(action, content, idea.title);
      setAiResult(result);
      if (!isEditing) {
        setIsEditing(true);
      }
    } catch (error) {
      console.error("AI Action Error:", error);
      alert("AI action failed. Please try again.");
    } finally {
      setIsPerformingAI(false);
    }
  };

  const acceptAIResult = () => {
    if (aiResult) {
      setContent(aiResult);
      setAiResult(null);
    }
  };

  const discardAIResult = () => {
    setAiResult(null);
  };

  const handleBlockAIAction = async (action: AIAction, text: string) => {
    setActiveBlockMenu(null);
    setIsPerformingAI(true);
    setAiResult(null);
    try {
      const result = await performAIAction(action, text, idea.title);
      setAiResult(result);
      if (!isEditing) {
        setIsEditing(true);
      }
    } catch (error) {
      console.error("AI Action Error:", error);
      alert("AI action failed. Please try again.");
    } finally {
      setIsPerformingAI(false);
    }
  };

  const isPrinciple = idea.type === 'Principle';

  return (
    <div className="flex h-full transition-colors duration-300">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950">
        <div className="max-w-3xl mx-auto w-full p-10">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 mb-10 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Garden
          </button>

          {idea.coverImage && (
            <div className="w-full h-80 bg-stone-100 dark:bg-stone-900 rounded-3xl mb-12 overflow-hidden border border-stone-200 dark:border-stone-800 shadow-2xl shadow-stone-900/5 dark:shadow-black/40">
              <img src={idea.coverImage} alt="Cover" className="w-full h-full object-cover" />
            </div>
          )}

          <header className="mb-12">
            <div className="flex items-center gap-4 mb-6">
              {!isPrinciple && (
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border",
                  idea.stage === 'Seed' ? "bg-stone-50 dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-800" :
                  idea.stage === 'Sprouting' ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/30" :
                  "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/30"
                )}>
                  {idea.stage}
                </span>
              )}
              {isPrinciple && (
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full border bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/30 flex items-center gap-2">
                  <Scale className="w-3.5 h-3.5" />
                  Life Principle
                </span>
              )}
              {section && (
                <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full flex items-center gap-2 border", section.color, "border-current opacity-80")}>
                  <Folder className="w-3.5 h-3.5" />
                  {section.name}
                </span>
              )}
              {!isPrinciple && (
                <div className="flex items-center gap-4 ml-auto text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  <span>Confidence: {idea.confidence}/10</span>
                  <span>Maturity: {idea.maturity}%</span>
                </div>
              )}
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-stone-900 dark:text-stone-100 mb-6 leading-tight">{idea.title}</h1>
            <p className="text-xl text-stone-500 dark:text-stone-400 leading-relaxed mb-10 font-medium">{idea.summary}</p>
            
            {!isPrinciple && (
              <div className="mb-12 p-8 bg-stone-50 dark:bg-stone-900/30 rounded-3xl border border-stone-100 dark:border-stone-800/50">
                <div className="flex items-center justify-between text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.3em] mb-4">
                  <span>Maturity Evolution</span>
                  <span>{idea.maturity}%</span>
                </div>
                <div className="w-full h-3 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden relative shadow-inner">
                  <div 
                    className="h-full bg-stone-900 dark:bg-stone-100 transition-all duration-1000 ease-out" 
                    style={{ width: `${idea.maturity}%` }}
                  />
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={idea.maturity}
                    onChange={(e) => updateIdea(idea.id, { maturity: parseInt(e.target.value) })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
                <div className="flex justify-between mt-4 text-[9px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">
                  <span>Raw Note</span>
                  <span>Seed</span>
                  <span>Sprout</span>
                  <span>Evergreen</span>
                </div>
              </div>
            )}
          </header>

          <div className="flex items-center gap-3 mb-12 border-b border-stone-100 dark:border-stone-800 pb-8">
            <button 
              onClick={handleTTS}
              disabled={isGeneratingAudio}
              className="flex items-center gap-2.5 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 rounded-xl transition-all disabled:opacity-50 active:scale-95"
            >
              <Volume2 className="w-4 h-4" />
              {isGeneratingAudio ? 'Generating...' : audioUrl ? 'Play Audio' : 'Listen to Idea'}
            </button>
            <div className="flex items-center gap-2 bg-stone-100 dark:bg-stone-900 rounded-xl p-1.5 border border-stone-200 dark:border-stone-800">
              <select 
                value={imageSize} 
                onChange={(e) => setImageSize(e.target.value as '1K' | '2K' | '4K')}
                className="bg-transparent text-[10px] font-bold text-stone-600 dark:text-stone-400 focus:outline-none px-3 cursor-pointer uppercase tracking-widest"
                disabled={isGeneratingImage}
              >
                <option value="1K">1K</option>
                <option value="2K">2K</option>
                <option value="4K">4K</option>
              </select>
              <button 
                onClick={handleGenerateImage}
                disabled={isGeneratingImage}
                className="flex items-center gap-2.5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-100 dark:text-stone-900 bg-stone-900 dark:bg-stone-100 hover:opacity-90 rounded-lg transition-all disabled:opacity-50 active:scale-95"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {isGeneratingImage ? 'Generating...' : 'Generate Cover'}
              </button>
            </div>
          </div>

          <div className="prose prose-stone dark:prose-invert max-w-none">
            {isEditing ? (
              <div className="space-y-6">
                {aiResult && (
                  <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-2xl p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-[10px] uppercase tracking-widest">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Suggestion
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={discardAIResult}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded-lg transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={acceptAIResult}
                          className="p-1.5 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded-lg transition-all"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="text-stone-800 dark:text-stone-200 text-sm leading-relaxed max-h-60 overflow-y-auto pr-2 scrollbar-hide">
                      <ReactMarkdown>{aiResult}</ReactMarkdown>
                    </div>
                  </div>
                )}
                <div className="relative">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full min-h-[400px] p-8 bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-2xl focus:outline-none focus:ring-4 focus:ring-stone-900/5 dark:focus:ring-stone-100/5 focus:border-stone-400 dark:focus:border-stone-700 transition-all resize-y font-mono text-base leading-relaxed"
                  />
                  {isPerformingAI && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-stone-950/50 backdrop-blur-[1px] flex items-center justify-center rounded-2xl z-10">
                      <div className="flex flex-col items-center gap-4">
                        <RefreshCw className="w-8 h-8 text-stone-400 animate-spin" />
                        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">AI is thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleAIAction('improve')}
                      className="p-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                      title="Improve Writing"
                    >
                      <Wand2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleAIAction('fix_grammar')}
                      className="p-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                      title="Fix Grammar"
                    >
                      <Type className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => handleAIAction('summarize')}
                      className="p-2 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                      title="Summarize"
                    >
                      <AlignLeft className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-end gap-4">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleSave}
                      className="px-8 py-2.5 text-sm font-bold uppercase tracking-widest text-white dark:text-stone-900 bg-stone-900 dark:bg-stone-100 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-stone-900/10 dark:shadow-stone-100/10"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div 
                onDoubleClick={() => setIsEditing(true)}
                onMouseUp={handleMouseUp}
                className="cursor-text group relative py-4"
              >
                <div className="absolute -left-8 top-0 bottom-0 w-1.5 bg-stone-200 dark:bg-stone-800 opacity-0 group-hover:opacity-100 transition-all rounded-full" />
                <div className="text-lg leading-relaxed text-stone-800 dark:text-stone-200">
                  <ReactMarkdown
                    components={{
                      p: ({node, ...props}) => (
                        <div className="group/block relative mb-6">
                          <p {...props} />
                          <div className="absolute -left-12 top-0 opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center h-full">
                            <button 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveBlockMenu({
                                  text: String(props.children),
                                  top: rect.bottom + window.scrollY,
                                  left: rect.left + window.scrollX,
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-blue-500 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-sm hover:shadow transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                      h1: ({node, ...props}) => (
                        <div className="group/block relative mb-6">
                          <h1 {...props} />
                          <div className="absolute -left-12 top-0 opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center h-full">
                            <button 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveBlockMenu({
                                  text: String(props.children),
                                  top: rect.bottom + window.scrollY,
                                  left: rect.left + window.scrollX,
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-blue-500 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-sm hover:shadow transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                      h2: ({node, ...props}) => (
                        <div className="group/block relative mb-4">
                          <h2 {...props} />
                          <div className="absolute -left-12 top-0 opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center h-full">
                            <button 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveBlockMenu({
                                  text: String(props.children),
                                  top: rect.bottom + window.scrollY,
                                  left: rect.left + window.scrollX,
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-blue-500 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-sm hover:shadow transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                      h3: ({node, ...props}) => (
                        <div className="group/block relative mb-4">
                          <h3 {...props} />
                          <div className="absolute -left-12 top-0 opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center h-full">
                            <button 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveBlockMenu({
                                  text: String(props.children),
                                  top: rect.bottom + window.scrollY,
                                  left: rect.left + window.scrollX,
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-blue-500 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-sm hover:shadow transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                      ul: ({node, ...props}) => (
                        <div className="group/block relative mb-6">
                          <ul {...props} />
                          <div className="absolute -left-12 top-0 opacity-0 group-hover/block:opacity-100 transition-opacity flex items-center h-full">
                            <button 
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveBlockMenu({
                                  text: "List items",
                                  top: rect.bottom + window.scrollY,
                                  left: rect.left + window.scrollX,
                                });
                              }}
                              className="p-1.5 text-stone-400 hover:text-blue-500 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-md shadow-sm hover:shadow transition-all"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ),
                    }}
                  >
                    {idea.content}
                  </ReactMarkdown>
                </div>
                <div className="mt-12 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                  <Sparkles className="w-3 h-3" />
                  Double-click to expand or edit. Highlight text to comment. Hover blocks for AI.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Block AI Menu */}
      <AnimatePresence>
        {activeBlockMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="fixed z-50 w-56 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl shadow-2xl overflow-hidden"
            style={{ top: activeBlockMenu.top + 8, left: activeBlockMenu.left }}
          >
            <div className="p-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/50">
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500 flex items-center gap-2">
                <Sparkles className="w-3 h-3" />
                Ask AI
              </span>
            </div>
            <div className="p-1.5 space-y-0.5">
              <button 
                onClick={() => handleBlockAIAction('improve', activeBlockMenu.text)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
              >
                <Wand2 className="w-3.5 h-3.5 text-blue-500" />
                Improve Writing
              </button>
              <button 
                onClick={() => handleBlockAIAction('fix_grammar', activeBlockMenu.text)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
              >
                <Type className="w-3.5 h-3.5 text-emerald-500" />
                Fix Grammar
              </button>
              <button 
                onClick={() => handleBlockAIAction('summarize', activeBlockMenu.text)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
              >
                <AlignLeft className="w-3.5 h-3.5 text-amber-500" />
                Summarize
              </button>
              <button 
                onClick={() => handleBlockAIAction('lengthen', activeBlockMenu.text)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors text-left"
              >
                <ChevronDown className="w-3.5 h-3.5 text-purple-500" />
                Make Longer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Comment Button */}
      {selection && !isAddingComment && !isEditing && (
        <div 
          className="fixed z-50 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-2 transform -translate-x-1/2 -translate-y-full"
          style={{ top: selection.top, left: selection.left }}
        >
          <button 
            onMouseDown={(e) => {
              e.preventDefault();
              setIsAddingComment(true);
            }}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest hover:opacity-80 transition-opacity"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Comment
          </button>
        </div>
      )}

      {/* Floating Comment Input */}
      {selection && isAddingComment && !isEditing && (
        <div 
          className="fixed z-50 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 p-3 rounded-xl shadow-2xl transform -translate-x-1/2 -translate-y-full w-72"
          style={{ top: selection.top, left: selection.left }}
        >
          <div className="text-[10px] text-stone-500 dark:text-stone-400 italic mb-2 pl-2 border-l-2 border-stone-200 dark:border-stone-700 line-clamp-2">
            "{selection.text}"
          </div>
          <textarea
            autoFocus
            value={newCommentText}
            onChange={(e) => setNewCommentText(e.target.value)}
            placeholder="Add a comment..."
            className="w-full bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:border-stone-400 dark:focus:border-stone-700 resize-none h-20 mb-2"
          />
          <div className="flex justify-end gap-2">
            <button 
              onClick={() => {
                setIsAddingComment(false);
                setSelection(null);
                setNewCommentText('');
                window.getSelection()?.removeAllRanges();
              }}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
            >
              Cancel
            </button>
            <button 
              onClick={() => {
                if (newCommentText.trim()) {
                  const newComment = {
                    id: Math.random().toString(36).substring(7),
                    selectedText: selection.text,
                    text: newCommentText,
                    createdAt: new Date().toISOString(),
                    resolved: false
                  };
                  updateIdea(idea.id, { comments: [...(idea.comments || []), newComment] });
                  setIsAddingComment(false);
                  setSelection(null);
                  setNewCommentText('');
                  window.getSelection()?.removeAllRanges();
                }
              }}
              className="px-3 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-md text-[10px] font-bold uppercase tracking-widest"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Right Sidebar: AI Actions & Metadata */}
      <div className="w-80 bg-stone-50/50 dark:bg-stone-950 p-8 overflow-y-auto border-l border-stone-200 dark:border-stone-800 transition-colors duration-300">
        <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
          <Sparkles className="w-3.5 h-3.5" />
          AI Intelligence
        </h3>
        <div className="space-y-3 mb-12">
          <button 
            onClick={() => handleAIAction('improve')}
            disabled={isPerformingAI}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/[0.05] transition-all text-left group disabled:opacity-50"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-300 group-hover:text-blue-700 dark:group-hover:text-blue-400">Improve Writing</span>
              <span className="text-[9px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-0.5">Clarity & Flow</span>
            </div>
            <Wand2 className="w-4 h-4 text-stone-400 group-hover:text-blue-500 group-hover:scale-110 transition-all" />
          </button>
          <button 
            onClick={() => handleAIAction('continue')}
            disabled={isPerformingAI}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-xl hover:shadow-emerald-500/[0.05] transition-all text-left group disabled:opacity-50"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-300 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">Continue Writing</span>
              <span className="text-[9px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-0.5">AI Drafts next part</span>
            </div>
            <Zap className="w-4 h-4 text-stone-400 group-hover:text-emerald-500 group-hover:scale-110 transition-all" />
          </button>
          <button 
            onClick={() => handleAIAction('brainstorm')}
            disabled={isPerformingAI}
            className="w-full flex items-center justify-between p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl hover:border-amber-400 dark:hover:border-amber-500 hover:shadow-xl hover:shadow-amber-500/[0.05] transition-all text-left group disabled:opacity-50"
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-stone-700 dark:text-stone-300 group-hover:text-amber-700 dark:group-hover:text-amber-400">Brainstorm</span>
              <span className="text-[9px] text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-0.5">5 Related Concepts</span>
            </div>
            <Sparkles className="w-4 h-4 text-stone-400 group-hover:text-amber-500 group-hover:scale-110 transition-all" />
          </button>
          
          <div className="pt-4 grid grid-cols-2 gap-2">
            <button 
              onClick={() => handleAIAction('shorten')}
              disabled={isPerformingAI}
              className="p-3 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all disabled:opacity-50"
            >
              Shorten
            </button>
            <button 
              onClick={() => handleAIAction('lengthen')}
              disabled={isPerformingAI}
              className="p-3 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all disabled:opacity-50"
            >
              Lengthen
            </button>
          </div>
        </div>

        {idea.comments && idea.comments.length > 0 && (
          <>
            <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.3em] mb-8 flex items-center gap-3">
              <MessageSquare className="w-3.5 h-3.5" />
              Comments
            </h3>
            <div className="space-y-4 mb-12">
              {idea.comments.map(comment => (
                <div key={comment.id} className="bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl p-5 relative group">
                  <button 
                    onClick={() => {
                      updateIdea(idea.id, { comments: idea.comments?.filter(c => c.id !== comment.id) });
                    }}
                    className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-50 dark:bg-stone-900 rounded-md"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="text-xs text-stone-500 dark:text-stone-400 italic mb-3 pl-3 border-l-2 border-stone-200 dark:border-stone-700 line-clamp-3">
                    "{comment.selectedText}"
                  </div>
                  <p className="text-sm text-stone-800 dark:text-stone-200 leading-relaxed">{comment.text}</p>
                </div>
              ))}
            </div>
          </>
        )}

        <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.3em] mb-8">Evolution</h3>
        <div className="space-y-3 mb-12">
          <button className="w-full flex items-center gap-4 p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl hover:border-stone-400 dark:hover:border-stone-600 hover:shadow-xl transition-all text-left group">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 group-hover:scale-110 transition-transform">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">Create Project</div>
              <div className="text-[10px] font-medium text-stone-500 dark:text-stone-500 uppercase tracking-wider mt-0.5">Track execution</div>
            </div>
          </button>
          <button className="w-full flex items-center gap-4 p-4 bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl hover:border-stone-400 dark:hover:border-stone-600 hover:shadow-xl transition-all text-left group">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 group-hover:scale-110 transition-transform">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">New Experiment</div>
              <div className="text-[10px] font-medium text-stone-500 dark:text-stone-500 uppercase tracking-wider mt-0.5">Test a hypothesis</div>
            </div>
          </button>
        </div>

        {idea.nextAction && (
          <>
            <h3 className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-[0.3em] mb-8">Next Action</h3>
            <div className="bg-white dark:bg-stone-900/40 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 mb-12 flex items-start gap-4 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-stone-900 dark:bg-stone-100" />
              <button className="mt-0.5 text-stone-300 dark:text-stone-700 hover:text-green-500 dark:hover:text-green-400 transition-all scale-110">
                <CheckCircle2 className="w-6 h-6" />
              </button>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300 leading-relaxed">{idea.nextAction}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
