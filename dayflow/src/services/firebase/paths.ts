import { CollectionReference, DocumentReference, collection, doc } from 'firebase/firestore';

import { db } from './config';

/** All user data lives under `users/{uid}` so ownership is structural. */
export const userDoc = (uid: string): DocumentReference => doc(db, 'users', uid);

const sub = (uid: string, name: string): CollectionReference =>
  collection(db, 'users', uid, name);

export const categoriesCol = (uid: string) => sub(uid, 'categories');
export const routinesCol = (uid: string) => sub(uid, 'routines');
export const routineLogsCol = (uid: string) => sub(uid, 'routineLogs');
export const tasksCol = (uid: string) => sub(uid, 'tasks');
export const coursesCol = (uid: string) => sub(uid, 'courses');
export const subjectsCol = (uid: string) => sub(uid, 'subjects');
export const chaptersCol = (uid: string, subjectId: string) =>
  collection(db, 'users', uid, 'subjects', subjectId, 'chapters');
export const topicsCol = (uid: string, subjectId: string, chapterId: string) =>
  collection(db, 'users', uid, 'subjects', subjectId, 'chapters', chapterId, 'topics');
export const studySessionsCol = (uid: string) => sub(uid, 'studySessions');
export const timetableSlotsCol = (uid: string) => sub(uid, 'timetableSlots');
export const revisionItemsCol = (uid: string) => sub(uid, 'revisionItems');
export const activityLogsCol = (uid: string) => sub(uid, 'activityLogs');
export const dailySummariesCol = (uid: string) => sub(uid, 'dailySummaries');
export const weeklySummariesCol = (uid: string) => sub(uid, 'weeklySummaries');
export const reflectionsCol = (uid: string) => sub(uid, 'reflections');
export const notesCol = (uid: string) => sub(uid, 'notes');

export const categoryDoc = (uid: string, id: string) => doc(categoriesCol(uid), id);
export const routineDoc = (uid: string, id: string) => doc(routinesCol(uid), id);
export const routineLogDoc = (uid: string, id: string) => doc(routineLogsCol(uid), id);
export const taskDoc = (uid: string, id: string) => doc(tasksCol(uid), id);
export const courseDoc = (uid: string, id: string) => doc(coursesCol(uid), id);
export const subjectDoc = (uid: string, id: string) => doc(subjectsCol(uid), id);
export const chapterDoc = (uid: string, subjectId: string, id: string) =>
  doc(chaptersCol(uid, subjectId), id);
export const topicDoc = (uid: string, subjectId: string, chapterId: string, id: string) =>
  doc(topicsCol(uid, subjectId, chapterId), id);
export const studySessionDoc = (uid: string, id: string) => doc(studySessionsCol(uid), id);
export const timetableSlotDoc = (uid: string, id: string) => doc(timetableSlotsCol(uid), id);
export const revisionItemDoc = (uid: string, id: string) => doc(revisionItemsCol(uid), id);
export const activityLogDoc = (uid: string, id: string) => doc(activityLogsCol(uid), id);
export const dailySummaryDoc = (uid: string, dateKey: string) =>
  doc(dailySummariesCol(uid), dateKey);
export const weeklySummaryDoc = (uid: string, weekKey: string) =>
  doc(weeklySummariesCol(uid), weekKey);
export const reflectionDoc = (uid: string, dateKey: string) => doc(reflectionsCol(uid), dateKey);
export const noteDoc = (uid: string, id: string) => doc(notesCol(uid), id);

/** Deterministic routine-log id — one document per routine per local day. */
export const routineLogId = (routineId: string, dateKey: string) => `${routineId}_${dateKey}`;
