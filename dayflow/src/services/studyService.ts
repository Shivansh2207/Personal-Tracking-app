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

import type {
  Chapter,
  ChapterStatus,
  Course,
  DateKey,
  SessionSource,
  StudySession,
  Subject,
  Topic,
} from '@/types/models';
import { toDateKey } from '@/utils/date';
import { CACHE_KEYS, readCache, writeCache } from './firebase/cache';
import { db } from './firebase/config';
import { pruneUndefined, tsToMillis } from './firebase/converters';
import {
  chapterDoc,
  chaptersCol,
  courseDoc,
  coursesCol,
  studySessionDoc,
  studySessionsCol,
  subjectDoc,
  subjectsCol,
  topicDoc,
  topicsCol,
} from './firebase/paths';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export function mapCourse(snap: any): Course {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    name: data.name ?? '',
    description: data.description ?? null,
    active: data.active !== false,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

export function mapSubject(snap: any): Subject {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    courseId: data.courseId ?? null,
    name: data.name ?? '',
    code: data.code ?? null,
    color: data.color ?? '#7C5CFF',
    icon: data.icon ?? 'book',
    targetDate: data.targetDate ?? null,
    examDate: data.examDate ?? null,
    weeklyTargetMinutes: data.weeklyTargetMinutes ?? null,
    order: data.order ?? 0,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapChapter(snap: any, subjectId: string): Chapter {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId,
    name: data.name ?? '',
    description: data.description ?? null,
    order: data.order ?? 0,
    status: data.status ?? 'not_started',
    progress: data.progress ?? 0,
    confidence: data.confidence ?? null,
    totalStudyMinutes: data.totalStudyMinutes ?? 0,
    lastStudiedAt: data.lastStudiedAt ? tsToMillis(data.lastStudiedAt) : null,
    completedAt: data.completedAt ? tsToMillis(data.completedAt) : null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
    updatedAt: tsToMillis(data.updatedAt, Date.now()),
  };
}

export function mapTopic(snap: any, subjectId: string, chapterId: string): Topic {
  const data = snap.data();
  return {
    id: snap.id,
    userId: data.userId,
    subjectId,
    chapterId,
    name: data.name ?? '',
    status: data.status ?? 'not_started',
    progress: data.progress ?? 0,
    confidence: data.confidence ?? null,
    notes: data.notes ?? null,
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
    chapterId: data.chapterId ?? null,
    topicIds: Array.isArray(data.topicIds) ? data.topicIds : [],
    dateKey: data.dateKey,
    plannedMinutes: data.plannedMinutes ?? null,
    actualMinutes: data.actualMinutes ?? 0,
    source: data.source ?? 'manual',
    timetableSlotId: data.timetableSlotId ?? null,
    startedAt: tsToMillis(data.startedAt, Date.now()),
    endedAt: tsToMillis(data.endedAt, Date.now()),
    confidence: data.confidence ?? null,
    progressBefore: data.progressBefore ?? null,
    progressAfter: data.progressAfter ?? null,
    notes: data.notes ?? null,
    createdAt: tsToMillis(data.createdAt, Date.now()),
  };
}

// ---------------------------------------------------------------------------
// Courses & subjects
// ---------------------------------------------------------------------------

export async function createCourse(uid: string, name: string): Promise<Course> {
  const ref = doc(coursesCol(uid));
  const payload = {
    userId: uid,
    name: name.trim(),
    description: null,
    active: true,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as Course;
}

export async function fetchCourses(uid: string): Promise<Course[]> {
  const snap = await getDocs(coursesCol(uid));
  return snap.docs.map(mapCourse);
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

export interface SubjectDraft {
  name: string;
  code?: string | null;
  courseId?: string | null;
  color?: string;
  icon?: string;
  targetDate?: DateKey | null;
  examDate?: DateKey | null;
  weeklyTargetMinutes?: number | null;
  order?: number;
}

export async function createSubject(uid: string, draft: SubjectDraft): Promise<Subject> {
  const ref = doc(subjectsCol(uid));
  const payload = pruneUndefined({
    userId: uid,
    courseId: draft.courseId ?? null,
    name: draft.name.trim(),
    code: draft.code ?? null,
    color: draft.color ?? '#7C5CFF',
    icon: draft.icon ?? 'book',
    targetDate: draft.targetDate ?? null,
    examDate: draft.examDate ?? null,
    weeklyTargetMinutes: draft.weeklyTargetMinutes ?? null,
    order: draft.order ?? Date.now() % 100000,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, createdAt: now, updatedAt: now } as Subject;
}

export async function createSubjects(uid: string, names: string[], courseId: string | null, colors: string[]): Promise<Subject[]> {
  const batch = writeBatch(db);
  const created: Subject[] = [];
  names.forEach((name, index) => {
    const ref = doc(subjectsCol(uid));
    const payload = {
      userId: uid,
      courseId,
      name: name.trim(),
      code: null,
      color: colors[index % colors.length],
      icon: 'book',
      targetDate: null,
      examDate: null,
      weeklyTargetMinutes: null,
      order: index,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(ref, payload);
    created.push({ ...(payload as any), id: ref.id, createdAt: Date.now(), updatedAt: Date.now() });
  });
  await batch.commit();
  return created;
}

export async function updateSubject(
  uid: string,
  id: string,
  patch: Partial<Omit<Subject, 'id' | 'userId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(subjectDoc(uid, id), pruneUndefined({ ...patch, updatedAt: serverTimestamp() }));
}

export interface SubjectHistory {
  chapters: number;
  sessions: number;
  minutes: number;
  slots: number;
}

/**
 * Deletes a subject and its chapters/topics. Study sessions are historical
 * records: they are kept but unlinked, so past totals stay honest.
 */
export async function deleteSubject(uid: string, id: string): Promise<void> {
  const chapters = await getDocs(chaptersCol(uid, id));
  for (const chapter of chapters.docs) {
    const topics = await getDocs(topicsCol(uid, id, chapter.id));
    for (let i = 0; i < topics.docs.length; i += 400) {
      const batch = writeBatch(db);
      topics.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  for (let i = 0; i < chapters.docs.length; i += 400) {
    const batch = writeBatch(db);
    chapters.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  const sessions = await getDocs(query(studySessionsCol(uid), where('subjectId', '==', id)));
  for (let i = 0; i < sessions.docs.length; i += 400) {
    const batch = writeBatch(db);
    sessions.docs
      .slice(i, i + 400)
      .forEach((d) => batch.update(d.ref, { subjectId: null, chapterId: null }));
    await batch.commit();
  }

  await deleteDoc(subjectDoc(uid, id));
}

// ---------------------------------------------------------------------------
// Chapters & topics
// ---------------------------------------------------------------------------

export function subscribeChapters(
  uid: string,
  subjectId: string,
  cb: (chapters: Chapter[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    chaptersCol(uid, subjectId),
    (snap) =>
      cb(snap.docs.map((d) => mapChapter(d, subjectId)).sort((a, b) => a.order - b.order)),
    onError,
  );
}

export async function fetchChapters(uid: string, subjectId: string): Promise<Chapter[]> {
  const snap = await getDocs(chaptersCol(uid, subjectId));
  return snap.docs.map((d) => mapChapter(d, subjectId)).sort((a, b) => a.order - b.order);
}

/** Every chapter across every subject — used by analytics and the timetable. */
export async function fetchAllChapters(uid: string, subjects: Subject[]): Promise<Chapter[]> {
  const lists = await Promise.all(subjects.map((s) => fetchChapters(uid, s.id).catch(() => [])));
  return lists.flat();
}

export async function fetchChapter(
  uid: string,
  subjectId: string,
  chapterId: string,
): Promise<Chapter | null> {
  const snap = await getDoc(chapterDoc(uid, subjectId, chapterId));
  return snap.exists() ? mapChapter(snap, subjectId) : null;
}

export async function createChapter(
  uid: string,
  subjectId: string,
  name: string,
  order: number,
): Promise<Chapter> {
  const ref = doc(chaptersCol(uid, subjectId));
  const payload = {
    userId: uid,
    name: name.trim(),
    description: null,
    order,
    status: 'not_started' as ChapterStatus,
    progress: 0,
    confidence: null,
    totalStudyMinutes: 0,
    lastStudiedAt: null,
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  const now = Date.now();
  return { ...(payload as any), id: ref.id, subjectId, createdAt: now, updatedAt: now } as Chapter;
}

export async function createChapters(
  uid: string,
  subjectId: string,
  names: string[],
  startOrder = 0,
): Promise<Chapter[]> {
  const batch = writeBatch(db);
  const created: Chapter[] = [];
  names.forEach((name, index) => {
    const ref = doc(chaptersCol(uid, subjectId));
    const payload = {
      userId: uid,
      name: name.trim(),
      description: null,
      order: startOrder + index,
      status: 'not_started' as ChapterStatus,
      progress: 0,
      confidence: null,
      totalStudyMinutes: 0,
      lastStudiedAt: null,
      completedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(ref, payload);
    created.push({
      ...(payload as any),
      id: ref.id,
      subjectId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  await batch.commit();
  return created;
}

export async function updateChapter(
  uid: string,
  subjectId: string,
  chapterId: string,
  patch: Partial<Omit<Chapter, 'id' | 'userId' | 'subjectId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(
    chapterDoc(uid, subjectId, chapterId),
    pruneUndefined({ ...patch, updatedAt: serverTimestamp() }),
  );
}

/**
 * Sets a chapter's status. Progress is only auto-filled when the user has not
 * set an explicit value — time studied never advances a chapter on its own.
 */
export async function setChapterStatus(
  uid: string,
  chapter: Chapter,
  status: ChapterStatus,
): Promise<void> {
  const patch: Record<string, unknown> = { status, updatedAt: serverTimestamp() };
  if (status === 'completed') {
    patch.progress = 100;
    patch.completedAt = serverTimestamp();
  } else if (chapter.status === 'completed') {
    patch.completedAt = null;
  }
  await updateDoc(chapterDoc(uid, chapter.subjectId, chapter.id), patch);
}

export async function deleteChapter(
  uid: string,
  subjectId: string,
  chapterId: string,
): Promise<void> {
  const topics = await getDocs(topicsCol(uid, subjectId, chapterId));
  for (let i = 0; i < topics.docs.length; i += 400) {
    const batch = writeBatch(db);
    topics.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const sessions = await getDocs(query(studySessionsCol(uid), where('chapterId', '==', chapterId)));
  for (let i = 0; i < sessions.docs.length; i += 400) {
    const batch = writeBatch(db);
    sessions.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { chapterId: null }));
    await batch.commit();
  }
  await deleteDoc(chapterDoc(uid, subjectId, chapterId));
}

export async function fetchTopics(
  uid: string,
  subjectId: string,
  chapterId: string,
): Promise<Topic[]> {
  const snap = await getDocs(topicsCol(uid, subjectId, chapterId));
  return snap.docs
    .map((d) => mapTopic(d, subjectId, chapterId))
    .sort((a, b) => a.order - b.order);
}

export async function createTopic(
  uid: string,
  subjectId: string,
  chapterId: string,
  name: string,
  order: number,
): Promise<Topic> {
  const ref = doc(topicsCol(uid, subjectId, chapterId));
  const payload = {
    userId: uid,
    name: name.trim(),
    status: 'not_started' as ChapterStatus,
    progress: 0,
    confidence: null,
    notes: null,
    order,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  const now = Date.now();
  return {
    ...(payload as any),
    id: ref.id,
    subjectId,
    chapterId,
    createdAt: now,
    updatedAt: now,
  } as Topic;
}

export async function updateTopic(
  uid: string,
  subjectId: string,
  chapterId: string,
  topicId: string,
  patch: Partial<Omit<Topic, 'id' | 'userId' | 'subjectId' | 'chapterId' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(
    topicDoc(uid, subjectId, chapterId, topicId),
    pruneUndefined({ ...patch, updatedAt: serverTimestamp() }),
  );
}

export async function deleteTopic(
  uid: string,
  subjectId: string,
  chapterId: string,
  topicId: string,
): Promise<void> {
  await deleteDoc(topicDoc(uid, subjectId, chapterId, topicId));
}

// ---------------------------------------------------------------------------
// Study sessions
// ---------------------------------------------------------------------------

export interface SessionDraft {
  subjectId: string | null;
  chapterId: string | null;
  topicIds?: string[];
  /** Session start timestamp; the day is derived from it. */
  startedAt: number;
  endedAt: number;
  actualMinutes: number;
  plannedMinutes?: number | null;
  source: SessionSource;
  timetableSlotId?: string | null;
  confidence?: number | null;
  progressBefore?: number | null;
  progressAfter?: number | null;
  notes?: string | null;
  /** Overrides the derived day; used only by manual back-dated logs. */
  dateKey?: DateKey;
}

/**
 * Saves a session and rolls its minutes into the chapter in one pass.
 *
 * A session that crosses midnight is attributed to the day it *started* on,
 * while the exact timestamps are preserved on the record.
 */
export async function saveStudySession(
  uid: string,
  draft: SessionDraft,
): Promise<StudySession> {
  const ref = doc(studySessionsCol(uid));
  const dateKey = draft.dateKey ?? toDateKey(new Date(draft.startedAt));
  const actualMinutes = Math.max(0, Math.round(draft.actualMinutes));

  const payload = pruneUndefined({
    userId: uid,
    subjectId: draft.subjectId ?? null,
    chapterId: draft.chapterId ?? null,
    topicIds: draft.topicIds ?? [],
    dateKey,
    plannedMinutes: draft.plannedMinutes ?? null,
    actualMinutes,
    source: draft.source,
    timetableSlotId: draft.timetableSlotId ?? null,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    confidence: draft.confidence ?? null,
    progressBefore: draft.progressBefore ?? null,
    progressAfter: draft.progressAfter ?? null,
    notes: draft.notes ?? null,
    createdAt: serverTimestamp(),
  });
  await setDoc(ref, payload);

  if (draft.subjectId && draft.chapterId && actualMinutes > 0) {
    const patch: Record<string, unknown> = {
      totalStudyMinutes: increment(actualMinutes),
      lastStudiedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (typeof draft.progressAfter === 'number') patch.progress = draft.progressAfter;
    if (typeof draft.confidence === 'number') patch.confidence = draft.confidence;
    await updateDoc(chapterDoc(uid, draft.subjectId, draft.chapterId), patch).catch(() => {
      // The chapter may have been deleted mid-session; the session still stands.
    });
  }

  return { ...(payload as any), id: ref.id, createdAt: Date.now() } as StudySession;
}

export async function deleteStudySession(uid: string, session: StudySession): Promise<void> {
  if (session.subjectId && session.chapterId && session.actualMinutes > 0) {
    await updateDoc(chapterDoc(uid, session.subjectId, session.chapterId), {
      totalStudyMinutes: increment(-session.actualMinutes),
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
    query(studySessionsCol(uid), where('dateKey', '>=', from), where('dateKey', '<=', to)),
  );
  return snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt);
}

export function subscribeSessionsForDate(
  uid: string,
  dateKey: DateKey,
  cb: (sessions: StudySession[]) => void,
  onError?: (e: unknown) => void,
) {
  return onSnapshot(
    query(studySessionsCol(uid), where('dateKey', '==', dateKey)),
    (snap) => cb(snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt)),
    onError,
  );
}

export async function fetchSessionsForChapter(
  uid: string,
  chapterId: string,
): Promise<StudySession[]> {
  const snap = await getDocs(query(studySessionsCol(uid), where('chapterId', '==', chapterId)));
  return snap.docs.map(mapSession).sort((a, b) => b.startedAt - a.startedAt);
}

export async function countSubjectHistory(
  uid: string,
  subjectId: string,
): Promise<SubjectHistory> {
  const [chapters, sessions] = await Promise.all([
    getDocs(chaptersCol(uid, subjectId)),
    getDocs(query(studySessionsCol(uid), where('subjectId', '==', subjectId))),
  ]);
  return {
    chapters: chapters.size,
    sessions: sessions.size,
    minutes: sessions.docs.reduce((a, d) => a + (d.data().actualMinutes ?? 0), 0),
    slots: 0,
  };
}
