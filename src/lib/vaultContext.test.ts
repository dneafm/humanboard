import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWholeVaultIndex } from './vaultContext';

test('buildWholeVaultIndex includes every major vault entity type', () => {
  const context = buildWholeVaultIndex({
    sections: [{ id: 'career', name: 'Career & Leverage', color: '' }],
    ideas: [{ id: 'i1', title: 'Own distribution', summary: '', content: '', type: 'Principle', stage: 'Evergreen', sectionId: 'career', confidence: 8, maturity: 80, lastReviewed: '', layer: 'knowledge', linkedNoteIds: [], relatedIdeaIds: [] }],
    notes: [{ id: 'n1', content: 'A raw signal', createdAt: '', layer: 'raw' }],
    goals: [{ id: 'g1', title: 'Build runway', description: '', status: 'Active', createdAt: '' }],
    projects: [{ id: 'p1', title: 'Launch tool', description: '', sourceIdeaId: '', status: 'Active', createdAt: '', lastUpdatedAt: '', linkedNoteIds: [], linkedIdeaIds: [], linkedGoalIds: [], tasks: [], updates: [], experiments: [] }],
    capabilityBets: [{ id: 'b1', title: 'Learn Chinese', thesis: '', baselineConviction: 50, conviction: 60, thresholdToCommit: 80, status: 'exploring', salience: 40, keywords: [], supportingSignalIds: [], contradictingSignalIds: [], complicatingSignalIds: [], lastReviewed: '', unlockPaths: [], firstUseCases: [], createdAt: '', updatedAt: '' }],
    fusionItems: [],
    reflections: [],
  });

  assert.match(context, /Own distribution/);
  assert.match(context, /Build runway/);
  assert.match(context, /Launch tool/);
  assert.match(context, /Learn Chinese/);
  assert.match(context, /A raw signal/);
});
