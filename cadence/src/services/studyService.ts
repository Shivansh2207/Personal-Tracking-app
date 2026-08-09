import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

import type { DateKey, StudySession, Subject, Topic, TopicStatus } from '@/types/models';
import { addDays, todayKey } from '@/utils/date';
import { progressForTopic } from './analytics/aggregate';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import {
  studySessionDoc,
  studySessionsCol,
  subjectDoc,
  subjectsCol,
  topicDoc,
  topicsCol,
} from './firebase/paths';

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  not_started: 'Not started',
  learning: 'Learning',
  practice: 'Practice',
  revision: 'Revision',
  completed: 'Completed',
};

export const TOPIC_STATUS_ORDER: TopicStatus[] = [
  'not_started',
  'learning',
  'practice',
  'revision',
  'completed',
];

export function mapSubject(snap: any): Subject {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    categoryId: data.categoryId ?? null,
    description: data.description ?? null,
    color: data.color ?? '#7C5CFF',
    icon: data.icon ?? 'book',
    targetDate: data.targetDate ?? null,
    examDate: data.examDate ?? null,
    order: data.order ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export function mapTopic(snap: any, subjectId: string): Topic {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId,
    name: data.name ?? '',
    description: data.description ?? null,
    status: data.status ?? 'not_started',
    progress: data.progress ?? 0,
    estimatedMinutes: data.estimatedMinutes ?? null,
    actualMinutes: data.actualMinutes ?? 0,
    confidence: data.confidence ?? null,
    lastStudiedAt: data.lastStudiedAt ? tsToMillis(data.lastStudiedAt) : null,
    nextRevisionDate: data.nextRevisionDate ?? null,
    order: data.order ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapSession(snap: any): StudySession {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId: data.subjectId ?? null,
    topicId: data.topicId ?? null,
    categoryId: data.categoryId ?? null,
    taskId: data.taskId ?? null,
    label: data.label ?? null,
    date: data.date,
    startedAt: tsToMillis(data.startedAt, Date.now()),
    endedAt: tsToMillis(data.endedAt, Date.now()),
    durationMinutes: data.durationMinutes ?? 0,
    productivityRating: data.productivityRating ?? null,
    notes: data.notes ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export function subscribeSubjects(
  uid: string,
  cb: (subjects: Subject[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    subjectsCol(uid),
    (snap) => {
      const subjects = snap.docs.map(mapSubject).sort((a, b) => a.order - b.order);
      cb(subjects);
      writeCache(uid, CACHE_KEYS.subjects, subjects);
    },
    onError,
  );
}

export function subscribeTopics(
  uid: string,
  subjectId: string,
  cb: (topics: Topic[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    topicsCol(uid, subjectId),
    (snap) =>
      cb(snap.docs.map((d) => mapTopic(d, subjectId)).sort((a, b) => a.order - b.order)),
    onError,
  );
}

export async function loadCachedSubjects(uid: string): Promise<Subject[]> {
  return (await readCache<Subject[]>(uid, CACHE_KEYS.subjects)) ?? [];
}

export async function fetchSubjects(uid: string): Promise<Subject[]> {
  const snap = await getDocs(subjectsCol(uid));
  return snap.docs.map(mapSubject).sort((a, b) => a.order - b.order);
}

export async function fetchSubject(uid: string, id: string): Promise<Subject | null> {
  const snap = await getDoc(subjectDoc(uid, id));
  return snap.exists() ? mapSubject(snap) : null;
}

export async function fetchTopics(uid: string, subjectId: string): Promise<Topic[]> {
  const snap = await getDocs(topicsCol(uid, subjectId));
  return snap.docs.map((d) => mapTopic(d, subjectId)).sort((a, b) => a.order - b.order);
}

/** Every topic across every subject — used by analytics and goal progress. */
export async function fetchAllTopics(uid: string, subjects: Subject[]): Promise<Topic[]> {
  const results = await Promise.all(subjects.map((s) => fetchTopics(uid, s.id)));
  return results.flat();
}

export interface SubjectDraft {
  name: string;
  categoryId?: string | null;
  description?: string | null;
  color?: string;
  icon?: string;
  targetDate?: DateKey | null;
  examDate?: DateKey | null;
  order?: number;
}

export async function createSubject(uid: string, draft: SubjectDraft): Promise<Subject> {
  const ref = doc(subjectsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    name: draft.name.trim(),
    categoryId: draft.categoryId ?? null,
    description: draft.description ?? null,
    color: draft.color ?? '#7C5CFF',
    icon: draft.icon ?? 'book',
    targetDate: draft.targetDate ?? null,
    examDate: draft.examDate ?? null,
    order: draft.order ?? Date.now() % 100000,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as Subject;
}

export async function updateSubject(
  uid: string,
  id: string,
  patch: Partial<Omit<Subject, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(subjectDoc(uid, id), pruneUndefined(patch));
}

/** Deletes a subject, its topics, and detaches its study sessions. */
export async function deleteSubject(uid: string, id: string): Promise<void> {
  const topics = await getDocs(topicsCol(uid, id));
  for (let i = 0; i < topics.docs.length; i += 400) {
    const batch = writeBatch(db);
    topics.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  // Sessions are historical records: keep them, but drop the dangling links.
  const sessions = await getDocs(query(studySessionsCol(uid), where('subjectId', '==', id)));
  for (let i = 0; i < sessions.docs.length; i += 400) {
    const batch = writeBatch(db);
    sessions.docs
      .slice(i, i + 400)
      .forEach((d) => batch.update(d.ref, { subjectId: null, topicId: null }));
    await batch.commit();
  }
  await deleteDoc(subjectDoc(uid, id));
}

export async function countSubjectHistory(
  uid: string,
  subjectId: string,
): Promise<{ topics: number; sessions: number; minutes: number }> {
  const [topics, sessions] = await Promise.all([
    getDocs(topicsCol(uid, subjectId)),
    getDocs(query(studySessionsCol(uid), where('subjectId', '==', subjectId))),
  ]);
  const minutes = sessions.docs.reduce((a, d) => a + (d.data().durationMinutes ?? 0), 0);
  return { topics: topics.size, sessions: sessions.size, minutes };
}

export interface TopicDraft {
  name: string;
  description?: string | null;
  status?: TopicStatus;
  estimatedMinutes?: number | null;
  order?: number;
}

export async function createTopic(
  uid: string,
  subjectId: string,
  draft: TopicDraft,
): Promise<Topic> {
  const ref = doc(topicsCol(uid, subjectId));
  const payload = pruneUndefined({
    userId: uid,
    name: draft.name.trim(),
    description: draft.description ?? null,
    status: draft.status ?? 'not_started',
    progress: 0,
    estimatedMinutes: draft.estimatedMinutes ?? null,
    actualMinutes: 0,
    confidence: null,
    lastStudiedAt: null,
    nextRevisionDate: null,
    order: draft.order ?? Date.now() % 100000,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, subjectId, createdAt: now, updatedAt: now } as Topic;
}

export async function updateTopic(
  uid: string,
  subjectId: string,
  topicId: string,
  patch: Partial<Omit<Topic, 'id' | 'userId' | 'subjectId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(
    topicDoc(uid, subjectId, topicId),
    pruneUndefined({ ...patch, updatedAt: serverTimestamp() }),
  );
}

export async function setTopicStatus(
  uid: string,
  topic: Topic,
  status: TopicStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  patch.progress = progressForTopic({ ...topic, status, progress: 0 });
  if (status === 'completed') {
    // Schedule a light-touch revision a week out.
    patch.nextRevisionDate = addDays(todayKey(), 7);
  }
  await updateDoc(topicDoc(uid, topic.subjectId, topic.id), patch);
}

export async function deleteTopic(
  uid: string,
  subjectId: string,
  topicId: string,
): Promise<void> {
  const sessions = await getDocs(query(studySessionsCol(uid), where('topicId', '==', topicId)));
  for (let i = 0; i < sessions.docs.length; i += 400) {
    const batch = writeBatch(db);
    sessions.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { topicId: null }));
    await batch.commit();
  }
  await deleteDoc(topicDoc(uid, subjectId, topicId));
}

export interface SessionDraft {
  subjectId?: string | null;
  topicId?: string | null;
  categoryId?: string | null;
  taskId?: string | null;
  label?: string | null;
  date: DateKey;
  startedAt: number;
  endedAt: number;
  durationMinutes: number;
  productivityRating?: number | null;
  notes?: string | null;
}

/**
 * Saves a focus session and rolls its minutes into the topic in one pass — the
 * user records the work once and every dependent number updates.
 */
export async function saveStudySession(
  uid: string,
  draft: SessionDraft,
): Promise<StudySession> {
  const ref = doc(studySessionsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    subjectId: draft.subjectId ?? null,
    topicId: draft.topicId ?? null,
    categoryId: draft.categoryId ?? null,
    taskId: draft.taskId ?? null,
    label: draft.label ?? null,
    date: draft.date,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    durationMinutes: Math.max(0, Math.round(draft.durationMinutes)),
    productivityRating: draft.productivityRating ?? null,
    notes: draft.notes ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);

  if (draft.subjectId && draft.topicId && payload.durationMinutes > 0) {
    await updateDoc(topicDoc(uid, draft.subjectId, draft.topicId), {
      actualMinutes: increment(payload.durationMinutes),
      lastStudiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }).catch(() => {
      // The topic may have been deleted mid-session; the session still stands.
    });
  }

  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as StudySession;
}

export async function updateStudySession(
  uid: string,
  id: string,
  patch: Partial<Omit<StudySession, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(studySessionDoc(uid, id), pruneUndefined(patch));
}

export async function deleteStudySession(uid: string, session: StudySession): Promise<void> {
  if (session.subjectId && session.topicId && session.durationMinutes > 0) {
    await updateDoc(topicDoc(uid, session.subjectId, session.topicId), {
      actualMinutes: increment(-session.durationMinutes),
    }).catch(() => {});
  }
  await deleteDoc(studySessionDoc(uid, session.id));
}

export async function fetchSessionsInRange(
  uid: string,
  from: DateKey,
  to: DateKey,
): Promise<StudySession[]> {
  const snap = await getDocs(
    query(studySessionsCol(uid), where('date', '>=', from), where('date', '<=', to)),
  );
  return snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt);
}

export async function fetchSessionsForDate(
  uid: string,
  date: DateKey,
): Promise<StudySession[]> {
  const snap = await getDocs(query(studySessionsCol(uid), where('date', '==', date)));
  return snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt);
}

export function subscribeSessionsForDate(
  uid: string,
  date: DateKey,
  cb: (sessions: StudySession[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(studySessionsCol(uid), where('date', '==', date)),
    (snap) => cb(snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt)),
    onError,
  );
}

export async function fetchSessionsForTopic(
  uid: string,
  topicId: string,
): Promise<StudySession[]> {
  const snap = await getDocs(query(studySessionsCol(uid), where('topicId', '==', topicId)));
  return snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt);
}
