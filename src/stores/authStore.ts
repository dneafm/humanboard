import { create } from 'zustand';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../config/firebase';

const AUTH_READY_FALLBACK_MS = 3500;

type AuthState = {
  user: User | null;
  userId: string | null;
  isAuthReady: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  setAuthUser: (user: User | null) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  userId: null,
  isAuthReady: !isFirebaseConfigured,
  signInWithGoogle: async () => {
    if (!auth) {
      throw new Error('Firebase is not configured. Set VITE_FIREBASE_* values in .env.local and rebuild.');
    }

    const credential = await signInWithPopup(auth, googleProvider);
    set({
      user: credential.user,
      userId: credential.user.uid,
      isAuthReady: true,
    });
  },
  signOutUser: async () => {
    if (!auth) {
      set({ user: null, userId: null, isAuthReady: true });
      return;
    }

    await signOut(auth);
    set({ user: null, userId: null, isAuthReady: true });
  },
  setAuthUser: (user) => {
    set({ user, userId: user?.uid ?? null, isAuthReady: true });
  },
}));

if (auth) {
  const authReadyFallback = window.setTimeout(() => {
    const { isAuthReady } = useAuthStore.getState();
    if (!isAuthReady) {
      useAuthStore.setState({ isAuthReady: true });
    }
  }, AUTH_READY_FALLBACK_MS);

  onAuthStateChanged(auth, (user) => {
    window.clearTimeout(authReadyFallback);
    useAuthStore.getState().setAuthUser(user);
  });
}
