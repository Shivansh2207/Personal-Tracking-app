/**
 * Focus timer.
 *
 * The running session is persisted to AsyncStorage as *timestamps*, never as a
 * remaining-seconds countdown. If the app is backgrounded or killed mid-session
 * the elapsed time is recomputed from `startedAt` on relaunch, so a 45-minute
 * session survives a crash intact.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { DateKey } from '@/types/models';
import { todayKey } from '@/utils/date';

const STORAGE_KEY = 'cadence.timer.session';

export type TimerMode = 'stopwatch' | 'countdown';

export interface ActiveSession {
  mode: TimerMode;
  /** Epoch ms when the session began. */
  startedAt: number;
  /** Total ms accumulated during previous run segments (before pauses). */
  accumulatedMs: number;
  /** Epoch ms when the current segment resumed; null while paused. */
  runningSince: number | null;
  /** Target length for countdown mode, in minutes. */
  targetMinutes: number | null;

  subjectId: string | null;
  topicId: string | null;
  categoryId: string | null;
  taskId: string | null;
  label: string;
  date: DateKey;
}

interface TimerState {
  session: ActiveSession | null;
  restored: boolean;

  restore: () => Promise<void>;
  start: (params: {
    mode: TimerMode;
    targetMinutes?: number | null;
    subjectId?: string | null;
    topicId?: string | null;
    categoryId?: string | null;
    taskId?: string | null;
    label: string;
  }) => void;
  pause: () => void;
  resume: () => void;
  discard: () => Promise<void>;
  /** Ends the session and returns its elapsed milliseconds. */
  finish: () => Promise<{ session: ActiveSession; elapsedMs: number } | null>;
  elapsedMs: () => number;
}

function computeElapsed(session: ActiveSession | null, now = Date.now()): number {
  if (!session) return 0;
  const live = session.runningSince ? now - session.runningSince : 0;
  return Math.max(0, session.accumulatedMs + live);
}

async function persist(session: ActiveSession | null) {
  try {
    if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // A failed persist only loses crash-recovery, not the live session.
  }
}

export const useTimerStore = create<TimerState>((set, get) => ({
  session: null,
  restored: false,

  restore: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        set({ restored: true });
        return;
      }
      const session = JSON.parse(raw) as ActiveSession;
      // Guard against a stale session left running for days.
      if (computeElapsed(session) > 12 * 60 * 60 * 1000) {
        await AsyncStorage.removeItem(STORAGE_KEY);
        set({ restored: true });
        return;
      }
      set({ session, restored: true });
    } catch {
      set({ restored: true });
    }
  },

  start: (params) => {
    const now = Date.now();
    const session: ActiveSession = {
      mode: params.mode,
      startedAt: now,
      accumulatedMs: 0,
      runningSince: now,
      targetMinutes: params.targetMinutes ?? null,
      subjectId: params.subjectId ?? null,
      topicId: params.topicId ?? null,
      categoryId: params.categoryId ?? null,
      taskId: params.taskId ?? null,
      label: params.label,
      date: todayKey(),
    };
    set({ session });
    persist(session);
  },

  pause: () => {
    const session = get().session;
    if (!session || !session.runningSince) return;
    const next: ActiveSession = {
      ...session,
      accumulatedMs: computeElapsed(session),
      runningSince: null,
    };
    set({ session: next });
    persist(next);
  },

  resume: () => {
    const session = get().session;
    if (!session || session.runningSince) return;
    const next: ActiveSession = { ...session, runningSince: Date.now() };
    set({ session: next });
    persist(next);
  },

  discard: async () => {
    set({ session: null });
    await persist(null);
  },

  finish: async () => {
    const session = get().session;
    if (!session) return null;
    const elapsedMs = computeElapsed(session);
    set({ session: null });
    await persist(null);
    return { session, elapsedMs };
  },

  elapsedMs: () => computeElapsed(get().session),
}));

export { computeElapsed };

export const TIMER_PRESETS = [25, 45, 60, 90] as const;
