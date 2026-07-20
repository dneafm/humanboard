import type { CapabilityBet, CapabilityTimelineEvent, Goal, Idea, Note, Project, Reflection, Section, SignalEvent, FusionItem, FusionSuggestion } from '../../store';

export type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  content: string;
  imageUrl?: string;
  createdAt: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export interface AppSnapshot {
  notes: Note[];
  ideas: Idea[];
  projects: Project[];
  sections: Section[];
  goals: Goal[];
  reflections: Reflection[];
  capabilityBets: CapabilityBet[];
  signalEvents: SignalEvent[];
  capabilityTimelineEvents: CapabilityTimelineEvent[];
  isDarkMode: boolean;
  chatMessages?: ChatMessage[];
  fusionItems?: FusionItem[];
  fusionSuggestions?: FusionSuggestion[];
  lastDailyFusionScan?: string;
  chatThreads?: ChatThread[];
  activeThreadId?: string;
}

export interface StorageRepository {
  load(): Promise<AppSnapshot>;
  save(snapshot: AppSnapshot): Promise<unknown>;
}

export const STORAGE_REPOSITORY_VERSION = 1;
