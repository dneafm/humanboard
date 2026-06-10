import type { Section } from '../store';

const SECTION_COLOR_PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
];

export const normalizeSectionName = (value?: string | null) => (value || '').trim().toLowerCase();

export const findSectionByName = (sections: Section[], value?: string | null) => {
  const normalized = normalizeSectionName(value);
  if (!normalized) return undefined;
  return sections.find((section) => normalizeSectionName(section.name) === normalized || normalizeSectionName(section.id) === normalized);
};

export const colorForNewSection = (sections: Section[]) => SECTION_COLOR_PALETTE[sections.length % SECTION_COLOR_PALETTE.length];
