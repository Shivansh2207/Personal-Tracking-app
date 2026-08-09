/**
 * Cold-start snapshot cache.
 *
 * Firestore's React Native build has no on-disk cache, so the last known value
 * of the small, frequently-read collections is mirrored into AsyncStorage. The
 * dashboard renders that immediately, then the live listener replaces it. This
 * is what makes the app usable on a flaky connection instead of showing a
 * spinner forever.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cadence.cache.';
const VERSION = 'v1';

interface Envelope<T> {
  v: string;
  at: number;
  data: T;
}

function keyFor(uid: string, name: string): string {
  return `${PREFIX}${uid}.${name}`;
}

export async function readCache<T>(uid: string, name: string, maxAgeMs?: number): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid, name));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.v !== VERSION) return null;
    if (maxAgeMs && Date.now() - env.at > maxAgeMs) return null;
    return env.data;
  } catch {
    return null;
  }
}

export async function writeCache<T>(uid: string, name: string, data: T): Promise<void> {
  try {
    const env: Envelope<T> = { v: VERSION, at: Date.now(), data };
    await AsyncStorage.setItem(keyFor(uid, name), JSON.stringify(env));
  } catch {
    // Cache failures must never break the app.
  }
}

export async function clearUserCache(uid: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(`${PREFIX}${uid}.`));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // ignore
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(PREFIX));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch {
    // ignore
  }
}

export const CACHE_KEYS = {
  profile: 'profile',
  categories: 'categories',
  habits: 'habits',
  goals: 'goals',
  subjects: 'subjects',
  todayTasks: 'todayTasks',
  todayHabitLogs: 'todayHabitLogs',
  recentStats: 'recentStats',
} as const;
