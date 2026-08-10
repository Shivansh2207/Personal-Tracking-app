import type { User } from 'firebase/auth';
import { create } from 'zustand';

import {
  DEFAULT_SETTINGS,
  completeOnboarding as completeOnboardingDoc,
  createProfileIfMissing,
  fetchCachedProfile,
  fetchProfile,
  logOut as signOutUser,
  subscribeToAuth,
  updateProfileDoc,
  updateSettings as persistSettings,
} from '@/services/userService';
import type { UserProfile, UserSettings } from '@/types/models';

export type AuthPhase = 'loading' | 'signed_out' | 'onboarding' | 'ready';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  phase: AuthPhase;
  profileError: string | null;
  initialised: boolean;

  init: () => () => void;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<UserSettings | null>;
  finishOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  phase: 'loading',
  profileError: null,
  initialised: false,

  init: () => {
    if (get().initialised) return () => {};
    set({ initialised: true });

    return subscribeToAuth(async (user) => {
      if (!user) {
        set({ user: null, profile: null, phase: 'signed_out', profileError: null });
        return;
      }
      set({ user });

      // Paint from cache first so a returning user is never bounced back to
      // the login screen while the network call resolves.
      const cached = await fetchCachedProfile(user.uid);
      if (cached) {
        set({
          profile: cached,
          phase: cached.onboardingCompleted ? 'ready' : 'onboarding',
        });
      }

      try {
        let profile = await fetchProfile(user.uid);
        if (!profile) profile = await createProfileIfMissing(user, user.displayName ?? '');
        set({
          profile,
          phase: profile.onboardingCompleted ? 'ready' : 'onboarding',
          profileError: null,
        });
      } catch (error) {
        if (!cached) {
          set({
            profileError:
              error instanceof Error ? error.message : 'Could not load your profile.',
            phase: 'onboarding',
          });
        }
      }
    });
  },

  refreshProfile: async () => {
    const { user } = get();
    if (!user) return;
    const profile = await fetchProfile(user.uid).catch(() => null);
    if (profile) {
      set({
        profile,
        phase: profile.onboardingCompleted ? 'ready' : 'onboarding',
        profileError: null,
      });
    }
  },

  updateProfile: async (patch) => {
    const { user, profile } = get();
    if (!user || !profile) return;
    set({ profile: { ...profile, ...patch } });
    try {
      await updateProfileDoc(user.uid, patch);
    } catch (error) {
      set({ profile });
      throw error;
    }
  },

  updateSettings: async (patch) => {
    const { user, profile } = get();
    if (!user || !profile) return null;
    const previous = profile.settings;
    const optimistic: UserSettings = {
      ...previous,
      ...patch,
      notifications: { ...previous.notifications, ...(patch.notifications ?? {}) },
    };
    set({ profile: { ...profile, settings: optimistic } });
    try {
      return await persistSettings(user.uid, previous, patch);
    } catch (error) {
      set({ profile: { ...profile, settings: previous } });
      throw error;
    }
  },

  finishOnboarding: async () => {
    const { user, profile } = get();
    if (!user) return;
    await completeOnboardingDoc(user.uid);
    set({
      phase: 'ready',
      profile: profile ? { ...profile, onboardingCompleted: true } : profile,
    });
  },

  signOut: async () => {
    await signOutUser();
    set({ user: null, profile: null, phase: 'signed_out' });
  },
}));

export function useSettings(): UserSettings {
  return useAuthStore((s) => s.profile?.settings ?? DEFAULT_SETTINGS);
}

export function useUid(): string | null {
  return useAuthStore((s) => s.user?.uid ?? null);
}
