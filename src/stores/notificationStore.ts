import { create } from 'zustand';
import { useAuthStore } from './authStore';
import {
  defaultNotificationSettings,
  type HumanBoardNotification,
  type NotificationCandidate,
  type NotificationSettings,
} from '../lib/notifications/schema';

type NotificationState = {
  notifications: HumanBoardNotification[];
  settings: NotificationSettings;
  loadedUserId: string | null;
  loadForCurrentUser: () => void;
  enqueue: (candidate: NotificationCandidate) => HumanBoardNotification | null;
  markDelivered: (id: string) => void;
  markRead: (id: string) => void;
  dismiss: (id: string) => void;
  clearDismissed: () => void;
  updateSettings: (updates: Partial<NotificationSettings>) => void;
};

function storageKey(userId: string) {
  return `humanboard.notifications.v1.${userId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function persist(state: Pick<NotificationState, 'notifications' | 'settings'>) {
  const userId = useAuthStore.getState().userId;
  if (!userId || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
}

function randomId() {
  return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isWithinCooldown(existing: HumanBoardNotification, candidate: NotificationCandidate) {
  if (existing.schedule.dedupeKey !== candidate.schedule.dedupeKey) return false;
  const cooldownMs = candidate.schedule.cooldownHours * 60 * 60 * 1000;
  return Date.now() - new Date(existing.createdAt).getTime() < cooldownMs;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  settings: defaultNotificationSettings,
  loadedUserId: null,
  loadForCurrentUser: () => {
    const userId = useAuthStore.getState().userId;
    if (!userId || typeof window === 'undefined') return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey(userId)) || '{}');
      set({
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        settings: { ...defaultNotificationSettings, ...(parsed.settings ?? {}) },
        loadedUserId: userId,
      });
    } catch {
      set({ notifications: [], settings: defaultNotificationSettings, loadedUserId: userId });
    }
  },
  enqueue: (candidate) => {
    const { notifications, settings } = get();
    if (!settings.enabled || candidate.insightConfidence < settings.minimumConfidence) return null;
    if (notifications.some((item) => isWithinCooldown(item, candidate))) return null;

    const today = new Date().toISOString().slice(0, 10);
    const deliveredToday = notifications.filter((item) => item.createdAt.startsWith(today)).length;
    if (deliveredToday >= settings.maxPerDay) return null;

    const notification: HumanBoardNotification = {
      ...candidate,
      id: randomId(),
      deliveryState: 'queued',
      createdAt: nowIso(),
    };
    const next = [notification, ...notifications].slice(0, 100);
    set({ notifications: next });
    persist({ notifications: next, settings });
    return notification;
  },
  markDelivered: (id) => set((state) => {
    const notifications = state.notifications.map((item) => (
      item.id === id ? { ...item, deliveryState: 'delivered' as const, deliveredAt: nowIso() } : item
    ));
    persist({ notifications, settings: state.settings });
    return { notifications };
  }),
  markRead: (id) => set((state) => {
    const notifications = state.notifications.map((item) => (
      item.id === id ? { ...item, deliveryState: 'read' as const, readAt: nowIso() } : item
    ));
    persist({ notifications, settings: state.settings });
    return { notifications };
  }),
  dismiss: (id) => set((state) => {
    const notifications = state.notifications.map((item) => (
      item.id === id ? { ...item, deliveryState: 'dismissed' as const, dismissedAt: nowIso() } : item
    ));
    persist({ notifications, settings: state.settings });
    return { notifications };
  }),
  clearDismissed: () => set((state) => {
    const notifications = state.notifications.filter((item) => item.deliveryState !== 'dismissed');
    persist({ notifications, settings: state.settings });
    return { notifications };
  }),
  updateSettings: (updates) => set((state) => {
    const settings = { ...state.settings, ...updates };
    persist({ notifications: state.notifications, settings });
    return { settings };
  }),
}));
