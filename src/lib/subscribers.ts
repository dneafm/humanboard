import { apiFetch } from './apiClient';

export type Subscriber = {
  id: string;
  email: string;
  sourceFusionId: string | null;
  referrer: string | null;
  subscribedAt: string;
  ip: string | null;
};

export type FusionSubscriberCount = {
  fusionId: string;
  count: number;
  title: string;
  type: string | null;
};

export type SubscribersResponse = {
  subscribers: Subscriber[];
  count: number;
  last7Days: number;
  byFusion: FusionSubscriberCount[];
};

export async function fetchSubscribers(): Promise<SubscribersResponse> {
  const response = await apiFetch('/api/admin/subscribers');
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to load subscribers (${response.status})`);
  }
  return response.json();
}

export async function deleteSubscriber(id: string): Promise<void> {
  const response = await apiFetch(`/api/admin/subscribers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed to delete subscriber (${response.status})`);
  }
}

export async function fetchSubscriberCount(): Promise<number> {
  const response = await apiFetch('/api/admin/subscribers/count');
  if (!response.ok) return 0;
  const payload = await response.json();
  return Number(payload?.count ?? 0);
}

export function subscribersToCsv(subscribers: Subscriber[]): string {
  const header = 'email,subscribed_at,source_fusion_id,referrer,ip';
  const rows = subscribers.map((s) => {
    const cells = [
      s.email,
      s.subscribedAt,
      s.sourceFusionId || '',
      s.referrer || '',
      s.ip || '',
    ].map((c) => {
      const v = String(c);
      if (v.includes(',') || v.includes('"') || v.includes('\n')) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    });
    return cells.join(',');
  });
  return [header, ...rows].join('\n');
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
