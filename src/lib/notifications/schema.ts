export const HUMANBOARD_NOTIFICATION_TYPES = [
  'daily_synthesis',
  'weekly_pattern',
  'memory_resurfaced',
  'contradiction_detected',
  'theme_recurrence',
  'unfinished_loop',
  'decision_support',
  'capture_prompt',
  'streak_nudge',
  'system_observation',
] as const;

export type HumanBoardNotificationType = typeof HUMANBOARD_NOTIFICATION_TYPES[number];
export type NotificationTone = 'quiet' | 'curious' | 'direct' | 'encouraging';
export type NotificationDeliveryState = 'queued' | 'delivered' | 'read' | 'dismissed' | 'expired';
export type NotificationChannel = 'in_app' | 'browser';

export type NotificationTriggerSource = {
  kind: 'note' | 'idea' | 'goal' | 'reflection' | 'capability_bet' | 'system';
  entityIds: string[];
  ruleId: string;
  observedAt: string;
};

export type NotificationAction = {
  label: string;
  deepLink: string;
};

export type NotificationSchedule = {
  scheduledFor: string;
  expiresAt?: string;
  cooldownHours: number;
  dedupeKey: string;
};

export type HumanBoardNotification = {
  id: string;
  type: HumanBoardNotificationType;
  title: string;
  body: string;
  insight: string;
  insightConfidence: number;
  tone: NotificationTone;
  trigger: NotificationTriggerSource;
  action?: NotificationAction;
  schedule: NotificationSchedule;
  channels: NotificationChannel[];
  deliveryState: NotificationDeliveryState;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
  dismissedAt?: string;
};

export type NotificationSettings = {
  enabled: boolean;
  browserEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  maxPerDay: number;
  minimumConfidence: number;
};

export const defaultNotificationSettings: NotificationSettings = {
  enabled: true,
  browserEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  maxPerDay: 3,
  minimumConfidence: 0.55,
};

export type NotificationCandidate = Omit<
  HumanBoardNotification,
  'id' | 'deliveryState' | 'createdAt' | 'deliveredAt' | 'readAt' | 'dismissedAt'
>;

