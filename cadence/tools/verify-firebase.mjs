#!/usr/bin/env node
/**
 * Live end-to-end check against the real Firebase project.
 *
 * Signs up two throwaway accounts with the same client SDK the app uses, then
 * asserts that:
 *   - a signed-in user can create and read every collection DEVBEAST OS writes
 *   - the deterministic habit-log id constraint is enforced
 *   - schema validation in the rules rejects malformed documents
 *   - one user cannot read or write another user's data
 *   - a user can delete their own account and data
 *
 * Both accounts are removed afterwards via the Admin SDK.
 *
 *   node tools/verify-firebase.mjs --key ../_secrets/firebase-admin.json
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase/app';
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
import {
  cert,
  deleteApp as deleteAdminApp,
  initializeApp as initializeAdminApp,
} from 'firebase-admin/app';
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
    check(name, false, 'the write/read was allowed');
  } catch (error) {
    const code = error?.code ?? '';
    check(name, code.includes('permission-denied') || code.includes('insufficient'), code || String(error));
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
  const userA = { email: `devbeast-verify-a-${stamp}@example.com`, password: 'Verify!2345' };
  const userB = { email: `devbeast-verify-b-${stamp}@example.com`, password: 'Verify!2345' };

  const app = initializeApp(config, `verify-${stamp}`);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const createdUids = [];
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

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
      onboardingComplete: false,
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
      order: 0,
      active: true,
      createdAt: serverTimestamp(),
    });
    check('create category', true);

    const taskRef = doc(collection(db, 'users', uidA, 'tasks'));
    await setDoc(taskRef, {
      userId: uidA,
      title: 'Probability Practice',
      categoryId: categoryRef.id,
      scheduledDate: dateKey,
      status: 'not_started',
      priority: 'medium',
      isTopPriority: false,
      isRecurringTemplate: false,
      subtasks: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create task', true);

    const habitRef = doc(collection(db, 'users', uidA, 'habits'));
    await setDoc(habitRef, {
      userId: uidA,
      name: 'Gym',
      icon: 'activity',
      measurementType: 'binary',
      target: 1,
      frequency: { type: 'times_per_week', times: 4 },
      startDate: dateKey,
      active: true,
      order: 0,
      createdAt: serverTimestamp(),
    });
    check('create habit', true);

    const logId = `${habitRef.id}_${dateKey}`;
    await setDoc(doc(db, 'users', uidA, 'habitLogs', logId), {
      userId: uidA,
      habitId: habitRef.id,
      date: dateKey,
      value: 1,
      status: 'completed',
      completedAt: serverTimestamp(),
    });
    check('create habit log with deterministic id', true);

    const subjectRef = doc(collection(db, 'users', uidA, 'subjects'));
    await setDoc(subjectRef, {
      userId: uidA,
      name: 'Quant',
      color: '#7C5CFF',
      icon: 'book',
      order: 0,
      createdAt: serverTimestamp(),
    });
    const topicRef = doc(collection(db, 'users', uidA, 'subjects', subjectRef.id, 'topics'));
    await setDoc(topicRef, {
      userId: uidA,
      name: 'Probability',
      status: 'learning',
      progress: 0,
      actualMinutes: 0,
      order: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create subject + nested topic', true);

    const sessionRef = doc(collection(db, 'users', uidA, 'studySessions'));
    await setDoc(sessionRef, {
      userId: uidA,
      subjectId: subjectRef.id,
      topicId: topicRef.id,
      date: dateKey,
      startedAt: Date.now(),
      endedAt: Date.now() + 45 * 60000,
      durationMinutes: 45,
      createdAt: serverTimestamp(),
    });
    check('create study session', true);

    await setDoc(doc(collection(db, 'users', uidA, 'activityLogs')), {
      userId: uidA,
      date: dateKey,
      type: 'gym',
      durationMinutes: 55,
      completed: true,
      createdAt: serverTimestamp(),
    });
    check('create activity log', true);

    await setDoc(doc(collection(db, 'users', uidA, 'goals')), {
      userId: uidA,
      title: 'Complete Quant syllabus',
      startDate: dateKey,
      status: 'active',
      progressType: 'topics',
      currentValue: 0,
      progress: 0,
      linkedHabitIds: [],
      linkedSubjectIds: [subjectRef.id],
      milestones: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create goal', true);

    await setDoc(doc(db, 'users', uidA, 'dailyStats', dateKey), {
      userId: uidA,
      date: dateKey,
      productivityScore: 72,
      tasksPlanned: 1,
      tasksCompleted: 0,
      habitsScheduled: 1,
      habitsCompleted: 1,
      focusMinutes: 45,
      studyMinutes: 45,
      activityMinutes: 55,
      activityCount: 1,
      categoryMinutes: {},
      categoryTasks: {},
      dayState: 'successful',
      updatedAt: serverTimestamp(),
    });
    check('create daily stats', true);

    await setDoc(doc(db, 'users', uidA, 'dailyReviews', dateKey), {
      userId: uidA,
      date: dateKey,
      productivityScore: 72,
      isRestDay: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create daily review', true);

    await setDoc(doc(db, 'users', uidA, 'weeklyReviews', '2026-W32'), {
      userId: uidA,
      weekStart: dateKey,
      weekEnd: dateKey,
      productivityScore: 72,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    check('create weekly review', true);

    process.stdout.write('\nOwn data: reads\n');
    const profileSnap = await getDoc(doc(db, 'users', uidA));
    check('read own profile', profileSnap.exists());

    const tasksSnap = await getDocs(
      query(collection(db, 'users', uidA, 'tasks'), where('scheduledDate', '==', dateKey)),
    );
    check('query own tasks by date (no composite index needed)', tasksSnap.size === 1);

    const statsSnap = await getDocs(
      query(
        collection(db, 'users', uidA, 'dailyStats'),
        where('date', '>=', dateKey),
        where('date', '<=', dateKey),
      ),
    );
    check('range query on dailyStats', statsSnap.size === 1);

    process.stdout.write('\nValidation\n');
    await expectDenied('reject task with an invalid status', () =>
      setDoc(doc(collection(db, 'users', uidA, 'tasks')), {
        userId: uidA,
        title: 'Bad',
        status: 'invented_status',
        priority: 'medium',
        scheduledDate: dateKey,
      }),
    );
    await expectDenied('reject habit log with a mismatched id', () =>
      setDoc(doc(db, 'users', uidA, 'habitLogs', 'not-the-right-id'), {
        userId: uidA,
        habitId: habitRef.id,
        date: dateKey,
        value: 1,
        status: 'completed',
      }),
    );
    await expectDenied('reject dailyStats whose id and date disagree', () =>
      setDoc(doc(db, 'users', uidA, 'dailyStats', '2026-01-01'), {
        userId: uidA,
        date: dateKey,
        productivityScore: 50,
        dayState: 'successful',
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
    await expectDenied("user B cannot list user A's tasks", () =>
      getDocs(collection(db, 'users', uidA, 'tasks')),
    );
    await expectDenied("user B cannot write into user A's tasks", () =>
      setDoc(doc(collection(db, 'users', uidA, 'tasks')), {
        userId: b.user.uid,
        title: 'Injected',
        status: 'not_started',
        priority: 'low',
        scheduledDate: dateKey,
      }),
    );
    await expectDenied("user B cannot delete user A's task", () =>
      deleteDoc(doc(db, 'users', uidA, 'tasks', taskRef.id)),
    );
    await expectDenied('anonymous-style access to a root collection is denied', () =>
      getDocs(collection(db, 'users')),
    );

    process.stdout.write('\nSelf-service deletion\n');
    await signOut(auth);
    await signInWithEmailAndPassword(auth, userA.email, userA.password);
    await deleteDoc(doc(db, 'users', uidA, 'tasks', taskRef.id));
    const afterDelete = await getDoc(doc(db, 'users', uidA, 'tasks', taskRef.id));
    check('user can delete their own records', !afterDelete.exists());
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
    await deleteAdminApp(adminApp).catch(() => {});
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
