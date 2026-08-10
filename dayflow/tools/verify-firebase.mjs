#!/usr/bin/env node
/**
 * Live end-to-end check against the real Firebase project.
 *
 * Signs up two throwaway accounts with the same client SDK the app uses, then
 * asserts that:
 *   - a signed-in user can create and read every collection DayFlow writes
 *   - the deterministic routine-log id constraint is enforced
 *   - schema validation in the rules rejects malformed documents
 *   - one user cannot read or write another user's data
 *   - a user can delete their own records
 *
 * Both accounts are removed afterwards via the Admin SDK.
 *
 *   node tools/verify-firebase.mjs --key ../_secrets/firebase-admin.json
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { cert, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // fall through to process.env
  }
  return { ...env, ...process.env };
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failed += 1;
    process.stdout.write(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}\n`);
  }
}

async function expectDenied(name, fn) {
  try {
    await fn();
    check(name, false, 'the operation was allowed');
  } catch (error) {
    const code = error?.code ?? '';
    check(
      name,
      code.includes('permission-denied') || code.includes('insufficient'),
      code || String(error),
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const keyIndex = args.indexOf('--key');
  const keyPath = keyIndex >= 0 ? args[keyIndex + 1] : process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.error('Pass --key <service-account.json>');
    process.exit(1);
  }

  const env = loadEnv();
  const config = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId) {
    console.error('Missing EXPO_PUBLIC_FIREBASE_* values (create .env from .env.example).');
    process.exit(1);
  }

  const credentials = JSON.parse(readFileSync(resolve(process.cwd(), keyPath), 'utf8'));
  const adminApp = initializeAdminApp({ credential: cert(credentials) });
  const adminAuth = getAdminAuth(adminApp);
  const adminDb = getAdminFirestore(adminApp);

  const stamp = Date.now();
  const userA = { email: `dayflow-verify-a-${stamp}@example.com`, password: 'Verify!2345' };
  const userB = { email: `dayflow-verify-b-${stamp}@example.com`, password: 'Verify!2345' };

  const app = initializeApp(config, `verify-${stamp}`);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const createdUids = [];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  try {
    process.stdout.write('\nAuthentication\n');
    const a = await createUserWithEmailAndPassword(auth, userA.email, userA.password);
    createdUids.push(a.user.uid);
    check('email/password sign-up works', !!a.user.uid);

    await signOut(auth);
    const reSignIn = await signInWithEmailAndPassword(auth, userA.email, userA.password);
    check('sign-in works', reSignIn.user.uid === a.user.uid);
    const uidA = a.user.uid;

    process.stdout.write('\nOwn data: writes\n');
    await setDoc(doc(db, 'users', uidA), {
      uid: uidA,
      name: 'Verify User',
      email: userA.email,
      onboardingCompleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create own profile', true);

    const categoryRef = doc(collection(db, 'users', uidA, 'categories'));
    await setDoc(categoryRef, {
      userId: uidA,
      name: 'Study',
      icon: 'book',
      color: '#7C5CFF',
      kind: 'study',
      order: 0,
      active: true,
      createdAt: serverTimestamp(),
    });
    check('create category', true);

    const routineRef = doc(collection(db, 'users', uidA, 'routines'));
    await setDoc(routineRef, {
      userId: uidA,
      name: 'Reading',
      icon: 'book-open',
      categoryId: categoryRef.id,
      trackingType: 'count',
      targetValue: 20,
      unit: 'pages',
      targetTime: null,
      schedule: { type: 'daily', startDate: dateKey },
      preferredTime: '20:00',
      dayPart: 'evening',
      reminderEnabled: false,
      reminderTime: null,
      notificationId: null,
      linkedSubjectId: null,
      active: true,
      order: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      archivedAt: null,
    });
    check('create routine', true);

    const logId = `${routineRef.id}_${dateKey}`;
    await setDoc(doc(db, 'users', uidA, 'routineLogs', logId), {
      userId: uidA,
      routineId: routineRef.id,
      dateKey,
      actualValue: 15,
      targetValueSnapshot: 20,
      actualTime: null,
      status: 'partial',
      startedAt: null,
      completedAt: serverTimestamp(),
      notes: null,
      createdAt: serverTimestamp(),
    });
    check('create routine log with deterministic id', true);

    const taskRef = doc(collection(db, 'users', uidA, 'tasks'));
    await setDoc(taskRef, {
      userId: uidA,
      title: 'Submit assignment',
      dateKey,
      status: 'pending',
      priority: 'normal',
      isRecurringTemplate: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create task', true);

    const subjectRef = doc(collection(db, 'users', uidA, 'subjects'));
    await setDoc(subjectRef, {
      userId: uidA,
      name: 'Engineering Mathematics',
      color: '#7C5CFF',
      icon: 'book',
      order: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const chapterRef = doc(collection(db, 'users', uidA, 'subjects', subjectRef.id, 'chapters'));
    await setDoc(chapterRef, {
      userId: uidA,
      name: 'Probability',
      order: 0,
      status: 'learning',
      progress: 45,
      totalStudyMinutes: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const topicRef = doc(
      collection(db, 'users', uidA, 'subjects', subjectRef.id, 'chapters', chapterRef.id, 'topics'),
    );
    await setDoc(topicRef, {
      userId: uidA,
      name: 'Bayes Theorem',
      status: 'learning',
      progress: 0,
      order: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create subject → chapter → topic', true);

    const slotRef = doc(collection(db, 'users', uidA, 'timetableSlots'));
    await setDoc(slotRef, {
      userId: uidA,
      subjectId: subjectRef.id,
      chapterMode: 'next_incomplete',
      fixedChapterId: null,
      daysOfWeek: [1, 3],
      startTime: '19:00',
      durationMinutes: 60,
      reminderOffsetMinutes: 5,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create timetable slot', true);

    await setDoc(doc(collection(db, 'users', uidA, 'studySessions')), {
      userId: uidA,
      subjectId: subjectRef.id,
      chapterId: chapterRef.id,
      topicIds: [],
      dateKey,
      plannedMinutes: 60,
      actualMinutes: 53,
      source: 'timetable',
      timetableSlotId: slotRef.id,
      startedAt: Date.now(),
      endedAt: Date.now() + 53 * 60000,
      createdAt: serverTimestamp(),
    });
    check('create study session', true);

    await setDoc(doc(collection(db, 'users', uidA, 'revisionItems')), {
      userId: uidA,
      subjectId: subjectRef.id,
      chapterId: chapterRef.id,
      topicId: null,
      dueDateKey: dateKey,
      status: 'due',
      revisionNumber: 1,
      completedAt: null,
      nextRevisionDateKey: null,
      createdAt: serverTimestamp(),
    });
    check('create revision item', true);

    await setDoc(doc(db, 'users', uidA, 'dailySummaries', dateKey), {
      userId: uidA,
      dateKey,
      routinesScheduled: 1,
      routinesCompleted: 0,
      routinesPartial: 1,
      routinesSkipped: 0,
      routineConsistency: 75,
      tasksPlanned: 1,
      tasksCompleted: 0,
      studyPlannedMinutes: 60,
      studyActualMinutes: 53,
      studyExtraMinutes: 0,
      timetableSlots: 1,
      timetableCompleted: 0,
      timetablePartial: 1,
      revisionDue: 1,
      revisionCompleted: 0,
      categoryMinutes: { study: 53 },
      overallConsistency: 62,
      isRestDay: false,
      updatedAt: serverTimestamp(),
    });
    check('create daily summary', true);

    await setDoc(doc(db, 'users', uidA, 'weeklySummaries', '2026-W33'), {
      userId: uidA,
      weekStart: dateKey,
      weekEnd: dateKey,
      studyMinutes: 53,
      routineConsistency: 75,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create weekly summary', true);

    await setDoc(doc(db, 'users', uidA, 'reflections', dateKey), {
      userId: uidA,
      dateKey,
      dayRating: 4,
      isRestDay: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create reflection', true);

    process.stdout.write('\nOwn data: reads\n');
    check('read own profile', (await getDoc(doc(db, 'users', uidA))).exists());

    const todayTasks = await getDocs(
      query(collection(db, 'users', uidA, 'tasks'), where('dateKey', '==', dateKey)),
    );
    check('query tasks by day (no composite index needed)', todayTasks.size === 1);

    const rangeLogs = await getDocs(
      query(
        collection(db, 'users', uidA, 'routineLogs'),
        where('dateKey', '>=', dateKey),
        where('dateKey', '<=', dateKey),
      ),
    );
    check('range query on routine logs', rangeLogs.size === 1);

    process.stdout.write('\nValidation\n');
    await expectDenied('reject a routine log whose id does not match its contents', () =>
      setDoc(doc(db, 'users', uidA, 'routineLogs', 'wrong-id'), {
        userId: uidA,
        routineId: routineRef.id,
        dateKey,
        actualValue: 1,
        status: 'completed',
      }),
    );
    await expectDenied('reject an unknown tracking type', () =>
      setDoc(doc(collection(db, 'users', uidA, 'routines')), {
        userId: uidA,
        name: 'Bad',
        trackingType: 'invented',
        schedule: { type: 'daily', startDate: dateKey },
      }),
    );
    await expectDenied('reject an unknown task status', () =>
      setDoc(doc(collection(db, 'users', uidA, 'tasks')), {
        userId: uidA,
        title: 'Bad',
        status: 'invented',
        priority: 'normal',
        dateKey,
      }),
    );
    await expectDenied('reject a daily summary whose id and date disagree', () =>
      setDoc(doc(db, 'users', uidA, 'dailySummaries', '2020-01-01'), {
        userId: uidA,
        dateKey,
        routineConsistency: 50,
      }),
    );
    await expectDenied('reject chapter progress outside 0–100', () =>
      setDoc(doc(collection(db, 'users', uidA, 'subjects', subjectRef.id, 'chapters')), {
        userId: uidA,
        name: 'Bad',
        order: 1,
        status: 'learning',
        progress: 250,
      }),
    );
    await expectDenied('reject a record claiming another userId', () =>
      setDoc(doc(collection(db, 'users', uidA, 'categories')), {
        userId: 'someone-else',
        name: 'Spoofed',
        icon: 'book',
        color: '#fff',
        order: 0,
        active: true,
      }),
    );

    process.stdout.write('\nIsolation between users\n');
    await signOut(auth);
    const b = await createUserWithEmailAndPassword(auth, userB.email, userB.password);
    createdUids.push(b.user.uid);
    check('second account created', !!b.user.uid);

    await expectDenied("user B cannot read user A's profile", () =>
      getDoc(doc(db, 'users', uidA)),
    );
    await expectDenied("user B cannot list user A's routines", () =>
      getDocs(collection(db, 'users', uidA, 'routines')),
    );
    await expectDenied("user B cannot list user A's study sessions", () =>
      getDocs(collection(db, 'users', uidA, 'studySessions')),
    );
    await expectDenied("user B cannot write into user A's tasks", () =>
      setDoc(doc(collection(db, 'users', uidA, 'tasks')), {
        userId: b.user.uid,
        title: 'Injected',
        status: 'pending',
        priority: 'low',
        dateKey,
      }),
    );
    await expectDenied("user B cannot delete user A's task", () =>
      deleteDoc(doc(db, 'users', uidA, 'tasks', taskRef.id)),
    );
    await expectDenied('the users collection itself is not listable', () =>
      getDocs(collection(db, 'users')),
    );

    process.stdout.write('\nSelf-service deletion\n');
    await signOut(auth);
    await signInWithEmailAndPassword(auth, userA.email, userA.password);
    await deleteDoc(doc(db, 'users', uidA, 'tasks', taskRef.id));
    check(
      'user can delete their own records',
      !(await getDoc(doc(db, 'users', uidA, 'tasks', taskRef.id))).exists(),
    );
  } catch (error) {
    failed += 1;
    process.stdout.write(`  ERROR ${error?.code ?? ''} ${error?.message ?? error}\n`);
  } finally {
    await signOut(auth).catch(() => {});
    for (const uid of createdUids) {
      await adminDb.recursiveDelete(adminDb.doc(`users/${uid}`)).catch(() => {});
      await adminAuth.deleteUser(uid).catch(() => {});
    }
    await deleteApp(app).catch(() => {});
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
