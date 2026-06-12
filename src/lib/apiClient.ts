import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getApiUserId() {
  return useAuthStore.getState().userId;
}

export async function buildApiHeaders(headers?: HeadersInit): Promise<Headers> {
  const merged = new Headers(headers);
  const { user, userId } = useAuthStore.getState();

  if (user) {
    try {
      const token = await user.getIdToken();
      merged.set('Authorization', `Bearer ${token}`);
    } catch (err) {
      console.error('Failed to get Firebase ID token:', err);
    }
  }

  if (userId && !merged.has('X-User-ID')) {
    merged.set('X-User-ID', userId);
  }

  return merged;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = await buildApiHeaders(init.headers);
  return fetch(apiUrl(path), {
    ...init,
    headers,
  });
}
