/**
 * Data export and account teardown.
 *
 * Both exports are built from the raw records rather than from any derived
 * cache, so what a user takes away is the real thing.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getDocs, writeBatch } from 'firebase/firestore';

import { APP_NAME } from '@/constants/app';
import { todayKey } from '@/utils/date';
import { db } from './firebase/config';
import {
  activityLogsCol,
  categoriesCol,
  chaptersCol,
  coursesCol,
  dailySummariesCol,
  notesCol,
  reflectionsCol,
  revisionItemsCol,
  routineLogsCol,
  routinesCol,
  studySessionsCol,
  subjectsCol,
  tasksCol,
  timetableSlotsCol,
  topicsCol,
  weeklySummariesCol,
} from './firebase/paths';

export type ExportFormat = 'json' | 'csv';

type Row = Record<string, unknown> & { id: string };

async function readAll(col: any): Promise<Row[]> {
  const snap = await getDocs(col);
  return snap.docs.map((d: any) => ({ id: d.id, ...serialise(d.data()) }));
}

/** Timestamps become ISO strings so the export reads well outside the app. */
function serialise(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialise);
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialise(v);
    return out;
  }
  return value;
}

export interface ExportBundle {
  app: string;
  version: number;
  exportedAt: string;
  categories: Row[];
  routines: Row[];
  routineLogs: Row[];
  tasks: Row[];
  courses: Row[];
  subjects: Row[];
  chapters: Row[];
  topics: Row[];
  studySessions: Row[];
  timetableSlots: Row[];
  revisionItems: Row[];
  activityLogs: Row[];
  dailySummaries: Row[];
  weeklySummaries: Row[];
  reflections: Row[];
  notes: Row[];
}

export async function buildExportBundle(uid: string): Promise<ExportBundle> {
  const subjects = await readAll(subjectsCol(uid));

  const chapters: Row[] = [];
  const topics: Row[] = [];
  for (const subject of subjects) {
    const subjectChapters = await readAll(chaptersCol(uid, subject.id));
    for (const chapter of subjectChapters) {
      chapters.push({ ...chapter, subjectId: subject.id });
      const chapterTopics = await readAll(topicsCol(uid, subject.id, chapter.id));
      topics.push(
        ...chapterTopics.map((t) => ({ ...t, subjectId: subject.id, chapterId: chapter.id })),
      );
    }
  }

  const [
    categories,
    routines,
    routineLogs,
    tasks,
    courses,
    studySessions,
    timetableSlots,
    revisionItems,
    activityLogs,
    dailySummaries,
    weeklySummaries,
    reflections,
    notes,
  ] = await Promise.all([
    readAll(categoriesCol(uid)),
    readAll(routinesCol(uid)),
    readAll(routineLogsCol(uid)),
    readAll(tasksCol(uid)),
    readAll(coursesCol(uid)),
    readAll(studySessionsCol(uid)),
    readAll(timetableSlotsCol(uid)),
    readAll(revisionItemsCol(uid)),
    readAll(activityLogsCol(uid)),
    readAll(dailySummariesCol(uid)),
    readAll(weeklySummariesCol(uid)),
    readAll(reflectionsCol(uid)),
    readAll(notesCol(uid)),
  ]);

  return {
    app: APP_NAME,
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    routines,
    routineLogs,
    tasks,
    courses,
    subjects,
    chapters,
    topics,
    studySessions,
    timetableSlots,
    revisionItems,
    activityLogs,
    dailySummaries,
    weeklySummaries,
    reflections,
    notes,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(',')).join('\n');
  return `${columns.join(',')}\n${body}`;
}

/** One labelled section per collection, which spreadsheets can split apart. */
export function bundleToCsv(bundle: ExportBundle): string {
  const sections: string[] = [];
  for (const [name, value] of Object.entries(bundle)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    sections.push(`## ${name}\n${toCsv(value as Row[])}`);
  }
  return sections.join('\n\n');
}

export interface ExportResult {
  uri: string;
  filename: string;
  shared: boolean;
}

export async function exportUserData(
  uid: string,
  format: ExportFormat,
): Promise<ExportResult> {
  const bundle = await buildExportBundle(uid);
  const content = format === 'json' ? JSON.stringify(bundle, null, 2) : bundleToCsv(bundle);
  const filename = `${APP_NAME.toLowerCase()}-export-${todayKey()}.${format}`;

  const file = new FileSystem.File(FileSystem.Paths.cache, filename);
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: format === 'json' ? 'application/json' : 'text/csv',
      dialogTitle: `Export ${APP_NAME} data`,
      UTI: format === 'json' ? 'public.json' : 'public.comma-separated-values-text',
    });
    shared = true;
  }

  return { uri: file.uri, filename, shared };
}

/**
 * Removes every subcollection under `users/{uid}`. Client SDKs cannot delete a
 * document tree in one call, so the known collections are walked explicitly
 * before the account itself is removed.
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  const refs: any[] = [];

  const subjects = await getDocs(subjectsCol(uid));
  for (const subject of subjects.docs) {
    const chapters = await getDocs(chaptersCol(uid, subject.id));
    for (const chapter of chapters.docs) {
      const topics = await getDocs(topicsCol(uid, subject.id, chapter.id));
      refs.push(...topics.docs.map((d) => d.ref));
    }
    refs.push(...chapters.docs.map((d) => d.ref));
  }

  const collections = [
    categoriesCol(uid),
    routinesCol(uid),
    routineLogsCol(uid),
    tasksCol(uid),
    coursesCol(uid),
    studySessionsCol(uid),
    timetableSlotsCol(uid),
    revisionItemsCol(uid),
    activityLogsCol(uid),
    dailySummariesCol(uid),
    weeklySummariesCol(uid),
    reflectionsCol(uid),
    notesCol(uid),
    subjectsCol(uid),
  ];

  for (const col of collections) {
    const snap = await getDocs(col);
    refs.push(...snap.docs.map((d) => d.ref));
  }

  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}
