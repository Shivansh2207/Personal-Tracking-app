/**
 * Local notifications.
 *
 * Everything is scheduled on-device — no push server, nothing that needs a paid
 * Firebase plan. Each category can be switched off independently and every
 * scheduler is a no-op when its category is disabled, so a user who opted out
 * is never nagged. Wording stays neutral: reminders, not guilt.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import { APP_NAME } from '@/constants/app';
import type {
  DateKey,
  RevisionItem,
  Routine,
  Task,
  TimetableSlot,
  UserSettings,
} from '@/types/models';
import { dateTimeToTimestamp, formatDuration, timeToMinutes, todayKey } from '@/utils/date';

let handlerConfigured = false;

export function configureNotificationHandler() {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: APP_NAME,
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#7C5CFF',
  }).catch(() => {});
}

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

export async function requestPermissions(): Promise<PermissionResult> {
  if (!Device.isDevice) return 'unavailable';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      await ensureAndroidChannel();
      return 'granted';
    }
    if (!current.canAskAgain) return 'denied';
    const next = await Notifications.requestPermissionsAsync();
    if (next.granted) {
      await ensureAndroidChannel();
      return 'granted';
    }
    return 'denied';
  } catch {
    return 'unavailable';
  }
}

export async function hasPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function schedule(
  content: Notifications.NotificationContentInput,
  trigger: Notifications.NotificationTriggerInput,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({ content, trigger });
  } catch {
    // Permission revoked mid-session, or a trigger already in the past.
    return null;
  }
}

export async function cancel(id: string | null | undefined): Promise<void> {
  if (!id) return;
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
}

export async function cancelAll(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

export async function listScheduled() {
  return Notifications.getAllScheduledNotificationsAsync().catch(() => []);
}

// ---------------------------------------------------------------------------
// Routine identifiers, so a category can be rebuilt without touching others
// ---------------------------------------------------------------------------

const ROUTINE_TAGS = {
  wake: 'dayflow-wake',
  summary: 'dayflow-daily-summary',
  weekly: 'dayflow-weekly-review',
} as const;

async function cancelTagged(tag: string) {
  const scheduled = await listScheduled();
  await Promise.all(
    scheduled
      .filter((n) => String(n.content.data?.tag ?? '') === tag)
      .map((n) => cancel(n.identifier)),
  );
}

// ---------------------------------------------------------------------------
// Schedulers
// ---------------------------------------------------------------------------

/** Daily "log your wake time" nudge, fired at the wake target. */
export async function syncWakeReminder(settings: UserSettings): Promise<void> {
  await cancelTagged(ROUTINE_TAGS.wake);
  if (!settings.notifications.enabled || !settings.notifications.wake) return;
  const minutes = timeToMinutes(settings.wakeTarget);
  if (minutes === null) return;

  await schedule(
    {
      title: 'Good morning',
      body: 'Log your wake time to start the day.',
      data: { kind: 'wake', tag: ROUTINE_TAGS.wake },
    },
    {
      type: SchedulableTriggerInputTypes.DAILY,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
  );
}

/** Per-routine reminder at its configured time. */
export async function scheduleRoutineReminder(
  routine: Routine,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.routines) return null;
  if (!routine.reminderEnabled) return null;
  const minutes = timeToMinutes(routine.reminderTime ?? routine.preferredTime);
  if (minutes === null) return null;

  return schedule(
    {
      title: routine.name,
      body: 'Ready when you are.',
      data: { kind: 'routine', routineId: routine.id },
    },
    {
      type: SchedulableTriggerInputTypes.DAILY,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
  );
}

/**
 * Weekly repeating reminders for a timetable slot — one per day the slot runs,
 * offset by the configured lead time.
 */
export async function scheduleSlotReminders(
  slot: TimetableSlot,
  subjectName: string,
  settings: UserSettings,
): Promise<string[]> {
  if (!settings.notifications.enabled || !settings.notifications.timetable) return [];
  const start = timeToMinutes(slot.startTime);
  if (start === null) return [];

  const offset = slot.reminderOffsetMinutes ?? settings.notifications.timetableOffsetMinutes;
  const fireAt = start - offset;
  if (fireAt < 0) return [];

  const ids: string[] = [];
  for (const day of slot.daysOfWeek) {
    const id = await schedule(
      {
        title: subjectName,
        body:
          offset > 0
            ? `Study session starts in ${offset} minute${offset === 1 ? '' : 's'}.`
            : 'Study session starts now.',
        data: { kind: 'timetable', slotId: slot.id },
      },
      {
        type: SchedulableTriggerInputTypes.WEEKLY,
        // expo-notifications weekday is 1-indexed with Sunday = 1.
        weekday: day + 1,
        hour: Math.floor(fireAt / 60),
        minute: fireAt % 60,
      },
    );
    if (id) ids.push(id);
  }
  return ids;
}

export async function scheduleTaskReminder(
  task: Task,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.tasks) return null;
  if (!task.dateKey || !task.startTime) return null;

  const lead = task.reminderMinutesBefore ?? settings.notifications.taskOffsetMinutes;
  const fireAt = dateTimeToTimestamp(task.dateKey, task.startTime) - lead * 60_000;
  if (fireAt <= Date.now() + 5_000) return null;

  return schedule(
    {
      title: task.title,
      body: lead > 0 ? `Starts in ${formatDuration(lead)}.` : 'Starting now.',
      data: { kind: 'task', taskId: task.id },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}

export async function scheduleRevisionReminder(
  item: RevisionItem,
  chapterName: string,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.revision) return null;
  const fireAt = dateTimeToTimestamp(item.dueDateKey, '09:00');
  if (fireAt <= Date.now()) return null;

  return schedule(
    {
      title: 'Revision due',
      body: `${chapterName} is scheduled for revision today.`,
      data: { kind: 'revision', revisionId: item.id },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}

/** Rebuilds the daily-summary and weekly-review reminders from settings. */
export async function syncRoutineReminders(settings: UserSettings): Promise<void> {
  await cancelTagged(ROUTINE_TAGS.summary);
  await cancelTagged(ROUTINE_TAGS.weekly);
  await syncWakeReminder(settings);
  if (!settings.notifications.enabled) return;

  if (settings.notifications.dailySummary) {
    const minutes = timeToMinutes(settings.notifications.dailySummaryTime) ?? 21 * 60 + 30;
    await schedule(
      {
        title: 'Your day so far',
        body: 'Take a look at how today went.',
        data: { kind: 'summary', tag: ROUTINE_TAGS.summary },
      },
      {
        type: SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
      },
    );
  }

  if (settings.notifications.weeklyReview) {
    await schedule(
      {
        title: 'Your weekly review is ready',
        body: 'See what actually moved this week.',
        data: { kind: 'weekly', tag: ROUTINE_TAGS.weekly },
      },
      {
        type: SchedulableTriggerInputTypes.WEEKLY,
        weekday: settings.weeklyReviewDay + 1,
        hour: 19,
        minute: 0,
      },
    );
  }
}

/** Neutral end-of-week nudge about a flexible target that is still short. */
export async function scheduleSessionTargetNudge(
  routineName: string,
  done: number,
  target: number,
  settings: UserSettings,
  dateKey: DateKey = todayKey(),
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.routines) return null;
  if (done >= target) return null;
  const fireAt = dateTimeToTimestamp(dateKey, '18:00');
  if (fireAt <= Date.now()) return null;

  return schedule(
    {
      title: routineName,
      body: `You have completed ${done} of ${target} this week.`,
      data: { kind: 'session-target' },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}
