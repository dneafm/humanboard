import assert from 'node:assert/strict';
import test from 'node:test';
import { debugLog, recordDebugEvent, summarizePayload } from './debugLog.ts';

test('recordDebugEvent appends an event with a monotonic id and timestamp', () => {
  debugLog.clear();
  const a = recordDebugEvent({ type: 'llm_request', label: 'askGemma', payload: { prompt: 'hi' } });
  const b = recordDebugEvent({ type: 'llm_response', label: 'askGemma', payload: { content: 'hello' } });
  assert.ok(b.id > a.id);
  assert.match(a.at, /^\d{4}-\d{2}-\d{2}T/);
  const list = debugLog.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].type, 'llm_request');
  assert.equal(list[1].type, 'llm_response');
  debugLog.clear();
});

test('debugLog evicts oldest events beyond MAX_EVENTS (200)', () => {
  debugLog.clear();
  for (let i = 0; i < 210; i++) {
    recordDebugEvent({ type: 'store_mutation', label: 'test', payload: { i } });
  }
  const list = debugLog.list();
  assert.equal(list.length, 200);
  // Newest event is the last (i=209). Oldest kept is i=10.
  assert.equal(list[0].payload.i, 10);
  assert.equal(list[list.length - 1].payload.i, 209);
  debugLog.clear();
});

test('summarizePayload truncates long strings', () => {
  const long = 'a'.repeat(200);
  const out = summarizePayload({ text: long, n: 42, ok: true });
  assert.match(out, /text="a{117}\.\.\."/);
  assert.match(out, /n=42/);
  assert.match(out, /ok=true/);
});

test('summarizePayload renders arrays by length', () => {
  const out = summarizePayload({ ids: ['a', 'b', 'c'] });
  assert.match(out, /ids=\[3\]/);
});

test('debugLog.subscribe fires on record and clear', () => {
  debugLog.clear();
  let calls = 0;
  const unsub = debugLog.subscribe(() => { calls += 1; });
  recordDebugEvent({ type: 'llm_request', label: 'x', payload: {} });
  recordDebugEvent({ type: 'llm_response', label: 'x', payload: {} });
  assert.equal(calls, 2);
  debugLog.clear();
  assert.equal(calls, 3);
  unsub();
});
