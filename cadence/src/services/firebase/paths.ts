import {
  CollectionReference,
  DocumentReference,
  collection,
  doc,
} from 'firebase/firestore';

import { db } from './config';

/** All user data lives under `users/{uid}` so ownership is structural. */
export const userDoc = (uid: string): DocumentReference => doc(db, 'users', uid);

const sub = (uid: string, name: string): CollectionReference =>
  collection(db, 'users', uid, name);

export const categoriesCol = (uid: string) => sub(uid, 'categories');
export const tasksCol = (uid: string) => sub(uid, 'tasks');
export const habitsCol = (uid: string) => sub(uid, 'habits');
export const habitLogsCol = (uid: string) => sub(uid, 'habitLogs');
export const subjectsCol = (uid: string) => sub(uid, 'subjects');
export const topicsCol = (uid: string, subjectId: string) =>
  collection(db, 'users', uid, 'subjects', subjectId, 'topics');
export const studySessionsCol = (uid: string) => sub(uid, 'studySessions');
export const activityLogsCol = (uid: string) => sub(uid, 'activityLogs');
export const goalsCol = (uid: string) => sub(uid, 'goals');
export const dailyStatsCol = (uid: string) => sub(uid, 'dailyStats');
export const dailyReviewsCol = (uid: string) => sub(uid, 'dailyReviews');
export const weeklyReviewsCol = (uid: string) => sub(uid, 'weeklyReviews');
export const reflectionsCol = (uid: string) => sub(uid, 'reflections');

export const categoryDoc = (uid: string, id: string) => doc(categoriesCol(uid), id);
export const taskDoc = (uid: string, id: string) => doc(tasksCol(uid), id);
export const habitDoc = (uid: string, id: string) => doc(habitsCol(uid), id);
export const habitLogDoc = (uid: string, id: string) => doc(habitLogsCol(uid), id);
export const subjectDoc = (uid: string, id: string) => doc(subjectsCol(uid), id);
export const topicDoc = (uid: string, subjectId: string, id: string) =>
  doc(topicsCol(uid, subjectId), id);
export const studySessionDoc = (uid: string, id: string) => doc(studySessionsCol(uid), id);
export const activityLogDoc = (uid: string, id: string) => doc(activityLogsCol(uid), id);
export const goalDoc = (uid: string, id: string) => doc(goalsCol(uid), id);
export const dailyStatsDoc = (uid: string, date: string) => doc(dailyStatsCol(uid), date);
export const dailyReviewDoc = (uid: string, date: string) => doc(dailyReviewsCol(uid), date);
export const weeklyReviewDoc = (uid: string, week: string) => doc(weeklyReviewsCol(uid), week);
export const reflectionDoc = (uid: string, id: string) => doc(reflectionsCol(uid), id);

/** Deterministic habit-log id — one document per habit per local day. */
export const habitLogId = (habitId: string, date: string) => `${habitId}_${date}`;
