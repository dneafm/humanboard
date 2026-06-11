import assert from 'node:assert/strict';
import test from 'node:test';
import { buildImportedSnapshot, parseSnapshotImport, snapshotImportCounts } from './snapshotImport';

test('parseSnapshotImport accepts legacy HumanBoard snapshots', () => {
  const snapshot = parseSnapshotImport(JSON.stringify({
    ideas: [{ id: 'idea-1', title: 'Operator with leverage', content: 'Ship outcomes.' }],
    capabilityBets: [{ id: 'bet-1', title: 'Learn Chinese' }],
  }));

  assert.equal(snapshot.ideas.length, 1);
  assert.equal(snapshot.capabilityBets.length, 1);
  assert.deepEqual(snapshotImportCounts(snapshot), {
    notes: 0,
    ideas: 1,
    projects: 0,
    goals: 0,
    reflections: 0,
    capabilityBets: 1,
  });
});

test('merge mode keeps current data and removes duplicate titles with different ids', () => {
  const current = parseSnapshotImport(JSON.stringify({
    ideas: [{ id: 'cloud-id', title: 'Operator with leverage', content: 'Cloud version.' }],
  }));
  const incoming = parseSnapshotImport(JSON.stringify({
    ideas: [
      { id: 'local-id', title: 'Operator with leverage', content: 'Local duplicate.' },
      { id: 'new-id', title: 'Own distribution', content: 'New idea.' },
    ],
  }));

  const merged = buildImportedSnapshot(current, incoming, 'merge');
  assert.deepEqual(merged.ideas.map((idea) => idea.title), ['Operator with leverage', 'Own distribution']);
});

test('replace mode returns imported board data', () => {
  const current = parseSnapshotImport(JSON.stringify({ notes: [{ id: 'old', content: 'Old note' }] }));
  const incoming = parseSnapshotImport(JSON.stringify({ notes: [{ id: 'new', content: 'New note' }] }));

  assert.deepEqual(buildImportedSnapshot(current, incoming, 'replace').notes, incoming.notes);
});
