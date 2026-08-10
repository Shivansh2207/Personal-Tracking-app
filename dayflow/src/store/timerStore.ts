/**
 * Study focus timer.
 *
 * The running session is persisted as *timestamps*, never as a remaining-
 * seconds countdown. Backgrounding, locking the phone or an outright crash
 * cannot corrupt the recorded duration: elapsed time is always recomputed from
 * `startedAt` plus the accumulated run segments.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { STORAGE_PREFIX } from '@/constants/app';
import type { DateKey, SessionSource } from '@/types/models';
import { toDateKey } from '@/utils/date';

const STORAGE_KEY = `${STORAGE_PREFIX}.timer.session`;
/** A session left running longer than this is treated as abandoned. */
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

export interface ActiveStudySession {
  /** Epoch ms the session began — also decides which day it belongs to. */
  startedAt: number;
  /** Milliseconds banked from earlier run segments (before each pause). */
  accumulatedMs: number;
  /** Epoch ms the current segment resumed; null while paused. */
  runningSince: number | null;
  plannedMinutes: number | null;

  subjectId: string | null;
  subjectName: string | null;
  chapterId: string | null;
  chapterName: string | null;
  topicIds: string[];
  timetableSlotId: string | null;
  source: SessionSource;
  /** The local day the session started on. */
  dateKey: DateKey;
}

interface TimerState {
  session: ActiveStudySession | null;
  restored: boolean;

  restore: () => Promise<void>;
  start: (params: Omit<ActiveStudySession, 'startedAt' | 'accumulatedMs' | 'runningSince' | 'dateKey'>) => void;
  pause: () => void;
  resume: () => void;
  discard: () => Promise<void>;
  finish: () => Promise<{ session: ActiveStudySession; elapsedMs: number } | null>;
  elapsedMs: () => number;
}

export function computeElapsed(session: ActiveStudySession | null, now = Date.now()): number {
  if (!session) return 0;
  const live = session.runningSince ? now - session.runningSince : 0;
  return Math.max(0, session.accumulatedMs + live);
}

async function persist(session: ActiveStudySession | null) {
  try {
    if (session) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // A failed persist only loses crash recovery, not the live session.
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
      const session = JSON.parse(raw) as ActiveStudySession;
      if (computeElapsed(session) > MAX_SESSION_MS) {
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
    const session: ActiveStudySession = {
      ...params,
      startedAt: now,
      accumulatedMs: 0,
      runningSince: now,
      dateKey: toDateKey(new Date(now)),
    };
    set({ session });
    persist(session);
  },

  pause: () => {
    const session = get().session;
    if (!session || !session.runningSince) return;
    const next: ActiveStudySession = {
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
    const next: ActiveStudySession = { ...session, runningSince: Date.now() };
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

export const TIMER_PRESETS = [25, 45, 60, 90] as const;
