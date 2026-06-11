import type { CapabilityBet, FusionItem, Goal, Idea, Note, Project, Reflection, Section } from '../store';

type VaultIndexInput = {
  notes: Note[];
  ideas: Idea[];
  projects: Project[];
  fusionItems: FusionItem[];
  goals: Goal[];
  reflections: Reflection[];
  capabilityBets: CapabilityBet[];
  sections: Section[];
};

const VAULT_INDEX_CHARACTER_LIMIT = 14_000;

function compact(value: unknown, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function joinTitles(values: string[], fallback = 'none') {
  return values.filter(Boolean).join('; ') || fallback;
}

export function buildWholeVaultIndex(input: VaultIndexInput) {
  const sectionNames = new Map(input.sections.map((section) => [section.id, section.name]));
  const ideasBySection = new Map<string, Idea[]>();
  for (const idea of input.ideas) {
    const section = sectionNames.get(idea.sectionId || '') || 'Unsorted';
    ideasBySection.set(section, [...(ideasBySection.get(section) || []), idea]);
  }

  const lines = [
    'WHOLE VAULT INDEX (complete entity-level awareness; use relevant detail context for deeper evidence):',
    `Sections: ${joinTitles(input.sections.map((section) => section.name))}`,
    ...[...ideasBySection.entries()].map(([section, ideas]) =>
      `Ideas in ${section} (${ideas.length}): ${joinTitles(ideas.map((idea) => `${idea.title} [${idea.type}/${idea.stage}]`))}`
    ),
    `Goals (${input.goals.length}): ${joinTitles(input.goals.map((goal) => `${goal.title} [${goal.status}]`))}`,
    `Projects (${input.projects.length}): ${joinTitles(input.projects.map((project) => `${project.title} [${project.status}]`))}`,
    `Capability bets (${input.capabilityBets.length}): ${joinTitles(input.capabilityBets.map((bet) => `${bet.title} [${bet.status}; conviction=${bet.conviction}]`))}`,
    `Fusion artifacts (${input.fusionItems.length}): ${joinTitles(input.fusionItems.map((item) => `${item.title} [${item.status}]`))}`,
    `Active reflections (${input.reflections.filter((reflection) => !reflection.dismissedAt).length}): ${joinTitles(input.reflections.filter((reflection) => !reflection.dismissedAt).map((reflection) => compact(reflection.pattern)))}`,
    `Recent Inbox notes (${input.notes.length} total; newest first): ${joinTitles(input.notes.slice(0, 20).map((note) => compact(note.content)))}`,
  ];

  const context = lines.join('\n');
  return context.length > VAULT_INDEX_CHARACTER_LIMIT
    ? `${context.slice(0, VAULT_INDEX_CHARACTER_LIMIT)}\n[Vault index truncated at ${VAULT_INDEX_CHARACTER_LIMIT} characters.]`
    : context;
}
