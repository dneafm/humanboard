import { useEffect } from 'react';
import { useAppStore } from '../store';
import { useAuthStore } from '../stores/authStore';
import { useNotificationStore } from '../stores/notificationStore';
import { buildNotificationCandidates, isQuietHours } from '../lib/notifications/engine';
import type { HumanBoardNotification } from '../lib/notifications/schema';

export function deliverBrowserNotification(notification: HumanBoardNotification) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const browserNotification = new Notification(notification.title, {
    body: notification.body,
    tag: notification.schedule.dedupeKey,
  });
  browserNotification.onclick = () => {
    window.focus();
    if (notification.action?.deepLink) window.location.assign(notification.action.deepLink);
    browserNotification.close();
  };
  return true;
}

export function runNotificationEngine() {
  const board = useAppStore.getState();
  const notificationStore = useNotificationStore.getState();
  const candidates = buildNotificationCandidates({
    notes: board.notes,
    ideas: board.ideas,
    goals: board.goals,
  });

  for (const candidate of candidates) {
    const queued = notificationStore.enqueue(candidate);
    if (!queued) continue;
    const settings = useNotificationStore.getState().settings;
    if (
      settings.browserEnabled
      && !isQuietHours(settings.quietHoursStart, settings.quietHoursEnd)
      && deliverBrowserNotification(queued)
    ) {
      useNotificationStore.getState().markDelivered(queued.id);
    }
  }
}

export default function NotificationEngine() {
  const userId = useAuthStore((state) => state.userId);
  const boardFingerprint = useAppStore((state) => [
    state.notes.length,
    state.ideas.length,
    state.goals.length,
    state.notes[0]?.createdAt,
  ].join(':'));

  useEffect(() => {
    if (!userId) return;
    useNotificationStore.getState().loadForCurrentUser();
    runNotificationEngine();
  }, [userId, boardFingerprint]);

  return null;
}
