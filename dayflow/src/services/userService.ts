import {
  EmailAuthProvider,
  User,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { deleteDoc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import type { UserProfile, UserSettings, UserType } from '@/types/models';
import { resolveTimezone } from '@/utils/date';
import { CACHE_KEYS, clearUserCache, readCache, writeCache } from './firebase/cache';
import { auth } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { userDoc } from './firebase/paths';

export const DEFAULT_SETTINGS: UserSettings = {
  weekStart: 1,
  use24HourTime: false,
  timezone: resolveTimezone(),

  wakeTarget: '07:00',
  wakeToleranceMinutes: 15,
  trackSleep: false,
  sleepTarget: null,

  autoCarryTasks: false,
  defaultStudyMinutes: 60,
  weeklyReviewDay: 0,

  notifications: {
    enabled: true,
    wake: true,
    routines: false,
    timetable: true,
    tasks: true,
    revision: true,
    dailySummary: false,
    weeklyReview: true,
    timetableOffsetMinutes: 5,
    taskOffsetMinutes: 15,
    dailySummaryTime: '21:30',
  },
};

export function subscribeToAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function signUp(params: {
  name: string;
  email: string;
  password: string;
}): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
  const displayName = params.name.trim();
  if (displayName) await updateProfile(cred.user, { displayName }).catch(() => {});
  await createProfileIfMissing(cred.user, displayName);
  return cred.user;
}

export async function signIn(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await createProfileIfMissing(cred.user, cred.user.displayName ?? '');
  return cred.user;
}

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  await signOut(auth);
  if (uid) await clearUserCache(uid);
}

export async function createProfileIfMissing(user: User, name: string): Promise<UserProfile> {
  const ref = userDoc(user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return normaliseProfile(user.uid, snap.data());

  const timezone = resolveTimezone();
  await setDoc(ref, {
    uid: user.uid,
    name: name || user.displayName || user.email?.split('@')[0] || 'there',
    email: user.email ?? '',
    userType: null,
    timezone,
    onboardingCompleted: false,
    settings: { ...DEFAULT_SETTINGS, timezone },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  const created = await getDoc(ref);
  return normaliseProfile(user.uid, created.data());
}

export async function fetchProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(userDoc(uid));
  if (!snap.exists()) return null;
  const profile = normaliseProfile(uid, snap.data());
  await writeCache(uid, CACHE_KEYS.profile, profile);
  return profile;
}

export async function fetchCachedProfile(uid: string): Promise<UserProfile | null> {
  return readCache<UserProfile>(uid, CACHE_KEYS.profile);
}

export async function updateProfileDoc(
  uid: string,
  patch: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(userDoc(uid), pruneUndefined({ ...patch, updatedAt: serverTimestamp() }));
}

export async function updateSettings(
  uid: string,
  current: UserSettings,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const next: UserSettings = {
    ...current,
    ...patch,
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
  };
  await updateDoc(userDoc(uid), { settings: next, updatedAt: serverTimestamp() });
  return next;
}

export async function setUserType(uid: string, userType: UserType | null): Promise<void> {
  await updateDoc(userDoc(uid), { userType, updatedAt: serverTimestamp() });
}

export async function completeOnboarding(uid: string): Promise<void> {
  await updateDoc(userDoc(uid), { onboardingCompleted: true, updatedAt: serverTimestamp() });
}

export async function deleteAccount(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  if (password && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }
  await deleteDoc(userDoc(user.uid)).catch(() => {});
  await clearUserCache(user.uid);
  await deleteUser(user);
}

export function normaliseProfile(uid: string, data: any): UserProfile {
  const timezone = data?.timezone ?? resolveTimezone();
  return {
    uid,
    name: data?.name ?? '',
    email: data?.email ?? '',
    userType: data?.userType ?? null,
    timezone,
    onboardingCompleted: Boolean(data?.onboardingCompleted),
    settings: {
      ...DEFAULT_SETTINGS,
      timezone,
      ...(data?.settings ?? {}),
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        ...(data?.settings?.notifications ?? {}),
      },
    },
    createdAt: tsToMillis(data?.createdAt, Date.now()),
    updatedAt: tsToMillis(data?.updatedAt, Date.now()),
  };
}
