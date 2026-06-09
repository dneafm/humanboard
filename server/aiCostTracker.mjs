export function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function roundUsd(value) {
  return Number(toFiniteNumber(value).toFixed(8));
}

export function createEmptyAiCostState() {
  return {
    totals: {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedUsd: 0,
    },
    byModel: {},
    recent: [],
    dailyRequests: {
      day: '',
      count: 0,
    },
  };
}

export function utcDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function getDailyRequestUsage(trackingState, value = new Date()) {
  const day = utcDayKey(value);
  const storedDay = String(trackingState?.dailyRequests?.day || '');
  return {
    day,
    count: storedDay === day ? toFiniteNumber(trackingState?.dailyRequests?.count, 0) : 0,
  };
}

export function incrementDailyRequestUsage(trackingState, value = new Date()) {
  const tracking = trackingState && typeof trackingState === 'object' ? trackingState : createEmptyAiCostState();
  const usage = getDailyRequestUsage(tracking, value);
  tracking.dailyRequests = {
    day: usage.day,
    count: usage.count + 1,
  };
  return tracking;
}

export function extractUsageTokens(usage = {}) {
  const promptTokens = toFiniteNumber(
    usage?.prompt_tokens ?? usage?.promptTokens ?? usage?.input_tokens ?? usage?.inputTokens,
    0,
  );
  const completionTokens = toFiniteNumber(
    usage?.completion_tokens ?? usage?.completionTokens ?? usage?.output_tokens ?? usage?.outputTokens,
    0,
  );
  const totalTokens = toFiniteNumber(
    usage?.total_tokens ?? usage?.totalTokens,
    promptTokens + completionTokens,
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens,
  };
}

export function calculateAiCost(pricing = {}, usage = {}) {
  const { promptTokens, completionTokens, totalTokens } = extractUsageTokens(usage);
  const estimatedUsd = roundUsd(
    promptTokens * toFiniteNumber(pricing?.prompt, 0)
      + completionTokens * toFiniteNumber(pricing?.completion, 0),
  );

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedUsd,
  };
}

export function applyAiCostRecord(trackingState, record) {
  const tracking = trackingState && typeof trackingState === 'object'
    ? {
        totals: {
          requests: toFiniteNumber(trackingState?.totals?.requests, 0),
          promptTokens: toFiniteNumber(trackingState?.totals?.promptTokens, 0),
          completionTokens: toFiniteNumber(trackingState?.totals?.completionTokens, 0),
          totalTokens: toFiniteNumber(trackingState?.totals?.totalTokens, 0),
          estimatedUsd: roundUsd(trackingState?.totals?.estimatedUsd ?? 0),
        },
        byModel: trackingState?.byModel && typeof trackingState.byModel === 'object' ? { ...trackingState.byModel } : {},
        recent: Array.isArray(trackingState?.recent) ? [...trackingState.recent] : [],
        dailyRequests: {
          day: String(trackingState?.dailyRequests?.day || ''),
          count: toFiniteNumber(trackingState?.dailyRequests?.count, 0),
        },
      }
    : createEmptyAiCostState();

  const currentModel = tracking.byModel[record.modelId] || {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    estimatedUsd: 0,
  };

  const modelTotals = {
    requests: toFiniteNumber(currentModel.requests, 0) + 1,
    promptTokens: toFiniteNumber(currentModel.promptTokens, 0) + toFiniteNumber(record.promptTokens, 0),
    completionTokens: toFiniteNumber(currentModel.completionTokens, 0) + toFiniteNumber(record.completionTokens, 0),
    totalTokens: toFiniteNumber(currentModel.totalTokens, 0) + toFiniteNumber(record.totalTokens, 0),
    estimatedUsd: roundUsd(toFiniteNumber(currentModel.estimatedUsd, 0) + toFiniteNumber(record.estimatedUsd, 0)),
  };
  tracking.byModel[record.modelId] = modelTotals;

  tracking.totals.requests += 1;
  tracking.totals.promptTokens += toFiniteNumber(record.promptTokens, 0);
  tracking.totals.completionTokens += toFiniteNumber(record.completionTokens, 0);
  tracking.totals.totalTokens += toFiniteNumber(record.totalTokens, 0);
  tracking.totals.estimatedUsd = roundUsd(tracking.totals.estimatedUsd + toFiniteNumber(record.estimatedUsd, 0));
  tracking.recent = [
    {
      at: record.at,
      requestId: record.requestId,
      model: record.modelId,
      promptTokens: toFiniteNumber(record.promptTokens, 0),
      completionTokens: toFiniteNumber(record.completionTokens, 0),
      totalTokens: toFiniteNumber(record.totalTokens, 0),
      estimatedUsd: roundUsd(record.estimatedUsd ?? 0),
      path: record.path,
    },
    ...tracking.recent,
  ].slice(0, 100);

  return tracking;
}
