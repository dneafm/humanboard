import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyAiCostState,
  extractUsageTokens,
  applyAiCostRecord,
  calculateAiCost,
  getDailyRequestUsage,
  incrementDailyRequestUsage,
} from './server/aiCostTracker.mjs';

test('extractUsageTokens reads OpenAI-style usage fields', () => {
  const usage = extractUsageTokens({
    prompt_tokens: 120,
    completion_tokens: 30,
    total_tokens: 150,
  });

  assert.deepEqual(usage, {
    promptTokens: 120,
    completionTokens: 30,
    totalTokens: 150,
  });
});

test('extractUsageTokens falls back across alternate usage field names', () => {
  const usage = extractUsageTokens({
    input_tokens: 80,
    output_tokens: 20,
  });

  assert.deepEqual(usage, {
    promptTokens: 80,
    completionTokens: 20,
    totalTokens: 100,
  });
});

test('calculateAiCost returns rounded token and usd totals', () => {
  const result = calculateAiCost(
    { prompt: 0.0000015, completion: 0.000002 },
    { prompt_tokens: 1000, completion_tokens: 500 },
  );

  assert.deepEqual(result, {
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    estimatedUsd: 0.0025,
  });
});

test('applyAiCostRecord accumulates totals, by-model values, and recent records', () => {
  const tracking = createEmptyAiCostState();
  incrementDailyRequestUsage(tracking, '2026-06-09T12:00:00.000Z');

  const updated = applyAiCostRecord(tracking, {
    requestId: 'req-1',
    path: '/api/ai/chat/completions',
    modelId: 'test-model',
    promptTokens: 100,
    completionTokens: 40,
    totalTokens: 140,
    estimatedUsd: 0.123456789,
    at: '2026-06-08T10:00:00.000Z',
  });

  assert.equal(updated.totals.requests, 1);
  assert.equal(updated.totals.promptTokens, 100);
  assert.equal(updated.totals.completionTokens, 40);
  assert.equal(updated.totals.totalTokens, 140);
  assert.equal(updated.totals.estimatedUsd, 0.12345679);
  assert.equal(updated.byModel['test-model'].requests, 1);
  assert.equal(updated.byModel['test-model'].estimatedUsd, 0.12345679);
  assert.equal(updated.recent.length, 1);
  assert.equal(updated.recent[0].requestId, 'req-1');
  assert.deepEqual(updated.dailyRequests, { day: '2026-06-09', count: 1 });
});

test('daily request usage increments and resets on a new UTC day', () => {
  const tracking = createEmptyAiCostState();
  incrementDailyRequestUsage(tracking, '2026-06-09T23:59:00.000Z');
  incrementDailyRequestUsage(tracking, '2026-06-09T23:59:30.000Z');
  assert.deepEqual(getDailyRequestUsage(tracking, '2026-06-09T23:59:59.000Z'), { day: '2026-06-09', count: 2 });
  assert.deepEqual(getDailyRequestUsage(tracking, '2026-06-10T00:00:00.000Z'), { day: '2026-06-10', count: 0 });
});
