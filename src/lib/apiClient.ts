import { useAuthStore } from '../stores/authStore';

const API_BASE_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getApiUserId() {
  return useAuthStore.getState().userId;
}

export function buildApiHeaders(headers?: HeadersInit) {
  const merged = new Headers(headers);
  const userId = getApiUserId();

  if (userId && !merged.has('X-User-ID')) {
    merged.set('X-User-ID', userId);
  }

  return merged;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), {
    ...init,
    headers: buildApiHeaders(init.headers),
  });
}
