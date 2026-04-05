import { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
};

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', content: "Hi. I'm your HumanBoard assistant. I can help you refine ideas, suggest experiments, or summarize your notes. What are we working on?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chat = ai.chats.create({
        model: 'gemini-3.1-flash-lite-preview',
        config: {
          systemInstruction: "You are the AI assistant for HumanBoard, a personal second-brain app focused on ideas. Be concise, calm, and highly actionable. Help the user refine ideas, suggest next steps, and connect concepts. Do not use markdown tables.",
        }
      });

      // Replay history (simplified for demo, ideally we pass history to chat creation or send sequentially)
      // For this simple implementation, we'll just send the latest message with some context.
      const historyContext = messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
      
      const response = await chat.sendMessage({ 
        message: `Previous context:\n${historyContext}\n\nUser: ${userMsg}` 
      });

      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: response.text || "I couldn't generate a response." 
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: "Sorry, I encountered an error connecting to the AI." 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 bg-stone-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-stone-800 transition-transform hover:scale-105 z-50"
      >
        <Bot className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div 
      className={cn(
        "fixed bottom-6 right-6 bg-white border border-stone-200 shadow-2xl flex flex-col z-50 transition-all duration-300 ease-in-out overflow-hidden",
        isExpanded ? "w-[600px] h-[800px] rounded-xl" : "w-[380px] h-[600px] rounded-2xl"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50/50">
        <div className="flex items-center gap-2 text-stone-800 font-medium text-sm">
          <Bot className="w-4 h-4 text-blue-600" />
          HumanBoard Assistant
        </div>
        <div className="flex items-center gap-1 text-stone-400">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-stone-200 rounded-md transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-stone-200 rounded-md transition-colors">
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
                ? "bg-stone-900 text-white rounded-br-sm" 
                : "bg-stone-100 text-stone-800 rounded-bl-sm prose prose-sm prose-stone"
            )}>
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-stone-100 text-stone-500 rounded-2xl rounded-bl-sm px-4 py-3 text-sm flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-stone-100 bg-white">
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="w-full bg-stone-50 border border-stone-200 rounded-full py-3 pl-4 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-400"
          />
          <button 
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 bg-stone-900 text-white rounded-full hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
