import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { useAppStore } from '../store';
import { generateDailySynthesis } from '../lib/ai';
import { buildDailySynthesisInput, localDayKey, readDailySynthesis, writeDailySynthesis, type DailySynthesis } from '../lib/dailySynthesis';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';

const inFlight = new Map<string, Promise<DailySynthesis>>();

function enqueueSynthesisNotification(synthesis: DailySynthesis) {
  const userId = useAuthStore.getState().userId;
  if (userId && useNotificationStore.getState().loadedUserId !== userId) {
    useNotificationStore.getState().loadForCurrentUser();
  }
  const notificationStore = useNotificationStore.getState();
  const queued = notificationStore.enqueue({
    type: 'daily_synthesis',
    title: synthesis.subject,
    body: synthesis.notification,
    insight: synthesis.insight,
    insightConfidence: 0.84,
    tone: 'direct',
    trigger: {
      kind: 'system',
      entityIds: synthesis.sourceEntityIds,
      ruleId: 'personalized-daily-synthesis-v1',
      observedAt: synthesis.generatedAt,
    },
    action: { label: 'Open Inbox', deepLink: '/' },
    channels: ['in_app', 'browser'],
    schedule: {
      scheduledFor: synthesis.generatedAt,
      expiresAt: new Date(new Date(synthesis.generatedAt).getTime() + 36 * 60 * 60 * 1000).toISOString(),
      cooldownHours: 20,
      dedupeKey: `daily_synthesis:${synthesis.day}`,
    },
  });
  if (
    queued
    && notificationStore.settings.browserEnabled
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
  ) {
    const notification = new Notification(queued.title, {
      body: queued.body,
      tag: queued.schedule.dedupeKey,
    });
    notification.onclick = () => {
      window.focus();
      window.location.assign('/');
      notification.close();
    };
    useNotificationStore.getState().markDelivered(queued.id);
  }
}

export default function DailySynthesisCard() {
  const userId = useAuthStore((state) => state.userId);
  const snapshot = useAppStore();
  const day = localDayKey();
  const [synthesis, setSynthesis] = useState<DailySynthesis | null>(() => userId ? readDailySynthesis(userId, day) : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardInput = useMemo(() => buildDailySynthesisInput(snapshot), [snapshot]);

  const run = useCallback(async (force = false) => {
    if (!userId) return;
    const cached = force ? null : readDailySynthesis(userId, day);
    if (cached) {
      setSynthesis(cached);
      enqueueSynthesisNotification(cached);
      return;
    }

    const requestKey = `${userId}:${day}`;
    setLoading(true);
    setError(null);
    try {
      let request = inFlight.get(requestKey);
      if (!request || force) {
        request = generateDailySynthesis(boardInput.summary, boardInput.sourceEntityIds, day);
        inFlight.set(requestKey, request);
      }
      const result = await request;
      writeDailySynthesis(userId, result);
      setSynthesis(result);
      enqueueSynthesisNotification(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not generate daily guidance.');
    } finally {
      inFlight.delete(requestKey);
      setLoading(false);
    }
  }, [boardInput, day, userId]);

  useEffect(() => {
    void run(false);
  }, [run]);

  return (
    <section className="rounded-xl border border-emerald-200/80 bg-emerald-50/65 px-4 py-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" />
            Daily synthesis
          </div>
          {synthesis ? (
            <>
              <h2 className="mt-2 text-base font-semibold text-stone-950 dark:text-stone-50">{synthesis.subject}</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-stone-700 dark:text-stone-300">{synthesis.insight}</p>
              <div className="mt-3 flex items-start gap-2 border-t border-emerald-200/70 pt-3 text-sm font-medium text-stone-900 dark:border-emerald-900/50 dark:text-stone-100">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
                <span>{synthesis.action}</span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              {loading ? 'Reading the strongest signals on your board...' : 'Generate one grounded direction for today.'}
            </p>
          )}
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
        <button
          type="button"
          onClick={() => void run(true)}
          disabled={loading || !userId}
          className="self-start shrink-0 rounded-md border border-emerald-200 bg-white p-2 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50 dark:border-emerald-900 dark:bg-stone-950 dark:text-emerald-400 dark:hover:bg-emerald-950 sm:self-auto"
          title="Regenerate daily synthesis"
          aria-label="Regenerate daily synthesis"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </section>
  );
}
