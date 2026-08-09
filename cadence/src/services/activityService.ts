import {
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import type { ActivityLog, ActivityType, DateKey } from '@/types/models';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import { activityLogDoc, activityLogsCol } from './firebase/paths';

export const ACTIVITY_TYPES: { value: ActivityType; label: string; icon: string }[] = [
  { value: 'gym', label: 'Gym', icon: 'activity' },
  { value: 'running', label: 'Running', icon: 'wind' },
  { value: 'walking', label: 'Walking', icon: 'footprints' },
  { value: 'cycling', label: 'Cycling', icon: 'bike' },
  { value: 'sports', label: 'Sports', icon: 'target' },
  { value: 'other', label: 'Other', icon: 'circle' },
];

export function mapActivity(snap: any): ActivityLog {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    date: data.date,
    type: data.type ?? 'gym',
    label: data.label ?? null,
    durationMinutes: data.durationMinutes ?? 0,
    completed: data.completed !== false,
    notes: data.notes ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export interface ActivityDraft {
  date: DateKey;
  type?: ActivityType;
  label?: string | null;
  durationMinutes?: number;
  completed?: boolean;
  notes?: string | null;
}

/**
 * Logging "I went to the gym" must take one tap — everything except the date
 * is optional.
 */
export async function logActivity(uid: string, draft: ActivityDraft): Promise<ActivityLog> {
  const ref = doc(activityLogsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    date: draft.date,
    type: draft.type ?? 'gym',
    label: draft.label ?? null,
    durationMinutes: Math.max(0, Math.round(draft.durationMinutes ?? 0)),
    completed: draft.completed !== false,
    notes: draft.notes ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as ActivityLog;
}

export async function updateActivity(
  uid: string,
  id: string,
  patch: Partial<Omit<ActivityLog, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(activityLogDoc(uid, id), pruneUndefined(patch));
}

export async function deleteActivity(uid: string, id: string): Promise<void> {
  await deleteDoc(activityLogDoc(uid, id));
}

export async function fetchActivitiesInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(activityLogsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapActivity).sort((a, b) => b.createdAt - a.createdAt);
}

export function subscribeActivitiesForDate(
  uid: string,
  date: DateKey,
  cb: (logs: ActivityLog[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(activityLogsCol(uid), where('date', '==', date)),
    (snap) => cb(snap.docs.map(mapActivity)),
    onError,
  );
}

export async function fetchActivitiesForDate(
  uid: string,
  date: DateKey,
): Promise<ActivityLog[]> {
  const snap = await getDocs(query(activityLogsCol(uid), where('date', '==', date)));
  return snap.docs.map(mapActivity);
}
