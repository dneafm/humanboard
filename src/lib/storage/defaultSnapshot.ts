import type { AppSnapshot } from './types';

export const defaultSections: AppSnapshot['sections'] = [
  { id: 'sec1', name: 'Technology & Tools', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  { id: 'sec2', name: 'Finance', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  { id: 'sec3', name: 'Health & Wellness', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' },
  { id: 'sec4', name: 'Lifestyle & Home', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
];

export const defaultSnapshot: AppSnapshot = {
  notes: [],
  ideas: [],
  projects: [],
  sections: defaultSections,
  goals: [],
  reflections: [],
  capabilityBets: [],
  signalEvents: [],
  capabilityTimelineEvents: [],
  isDarkMode: false,
};
