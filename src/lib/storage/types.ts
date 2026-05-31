import type { CapabilityBet, CapabilityTimelineEvent, Goal, Idea, Note, Project, Reflection, Section, SignalEvent } from '../../store';

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
}

export interface StorageRepository {
  load(): Promise<AppSnapshot>;
  save(snapshot: AppSnapshot): Promise<void>;
}

export const STORAGE_REPOSITORY_VERSION = 1;
