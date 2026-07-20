import assert from 'node:assert/strict';
import test from 'node:test';
import { diffFusionFields } from './fusionUpdateDiff.ts';

test('diffFusionFields returns empty array when no fields actually changed', () => {
  const before = { title: 'Abstract Control Protocol', status: 'Draft' };
  const after = { title: 'Abstract Control Protocol', status: 'Draft' };
  const nextUpdates = { title: 'Abstract Control Protocol', status: 'Draft' };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), []);
});

test('diffFusionFields flags a single changed field', () => {
  const before = { title: 'Old', status: 'Draft' };
  const after = { title: 'New', status: 'Draft' };
  const nextUpdates = { title: 'New', status: 'Draft' };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), ['title']);
});

test('diffFusionFields handles array changes (linkedNoteIds add)', () => {
  const before = { linkedNoteIds: ['n1', 'n2'] };
  const after = { linkedNoteIds: ['n1', 'n2', 'n3'] };
  const nextUpdates = { linkedNoteIds: ['n1', 'n2', 'n3'] };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), ['linkedNoteIds']);
});

test('diffFusionFields handles array changes (linkedNoteIds reorder)', () => {
  // Order matters — `a.some((v, i) => v !== b[i])` is strict.
  const before = { linkedNoteIds: ['n1', 'n2'] };
  const after = { linkedNoteIds: ['n2', 'n1'] };
  const nextUpdates = { linkedNoteIds: ['n2', 'n1'] };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), ['linkedNoteIds']);
});

test('diffFusionFields ignores fields that are not in nextUpdates', () => {
  // The `after` state may have a different updatedAt, but that field
  // is not in nextUpdates so it should not be reported as changed.
  const before = { title: 'X', updatedAt: '2026-01-01' };
  const after = { title: 'X', updatedAt: '2026-12-31' };
  const nextUpdates = { title: 'X' };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), []);
});

test('diffFusionFields flags no-op writes (e.g. setting title to same value)', () => {
  // The model said "rename to X" but the title was already X.
  const before = { title: 'Same Title' };
  const after = { title: 'Same Title' };
  const nextUpdates = { title: 'Same Title' };
  assert.deepEqual(diffFusionFields(before, after, nextUpdates), []);
});
