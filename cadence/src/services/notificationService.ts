/**
 * Local notifications.
 *
 * Everything is scheduled on-device (no push server, no paid plan needed).
 * Each category can be switched off independently, and every scheduler is a
 * no-op when its category is disabled — the app never nags a user who opted
 * out.
 */

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { SchedulableTriggerInputTypes } from 'expo-notifications';
import { Platform } from 'react-native';

import type { DateKey, Goal, Habit, Task, UserSettings } from '@/types/models';
import { dateTimeToTimestamp, timeToMinutes, todayKey } from '@/utils/date';

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
    name: 'DEVBEAST OS',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#41CFFF',
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
    const current = await Notifications.getPermissionsAsync();
    return current.granted;
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
    // Permission revoked mid-session, or a trigger in the past.
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

/** Reminder fired N minutes before a scheduled task. Past times are skipped. */
export async function scheduleTaskReminder(
  task: Task,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.taskReminders) return null;
  if (!task.scheduledDate || !task.startTime) return null;

  const lead = task.reminderMinutesBefore ?? settings.notifications.taskLeadMinutes;
  const fireAt = dateTimeToTimestamp(task.scheduledDate, task.startTime) - lead * 60_000;
  if (fireAt <= Date.now() + 5_000) return null;

  return schedule(
    {
      title: task.title,
      body:
        lead > 0
          ? `Starts in ${lead} minute${lead === 1 ? '' : 's'}.`
          : 'Starting now.',
      data: { kind: 'task', taskId: task.id },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}

/** Daily repeating reminder at the habit's configured time. */
export async function scheduleHabitReminder(
  habit: Habit,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.habitReminders) return null;
  const minutes = timeToMinutes(habit.reminderTime);
  if (minutes === null) return null;

  return schedule(
    {
      title: habit.name,
      body: 'Time to check this one off.',
      data: { kind: 'habit', habitId: habit.id },
    },
    {
      type: SchedulableTriggerInputTypes.DAILY,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
  );
}

export async function scheduleGoalDeadline(
  goal: Goal,
  settings: UserSettings,
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.goalDeadlines) return null;
  if (!goal.targetDate) return null;
  const fireAt = dateTimeToTimestamp(goal.targetDate, '09:00');
  if (fireAt <= Date.now()) return null;
  return schedule(
    {
      title: goal.title,
      body: 'Target date reached — check where this goal landed.',
      data: { kind: 'goal', goalId: goal.id },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}

const ROUTINE_IDS = {
  planning: 'cadence-daily-planning',
  review: 'cadence-daily-review',
  weekly: 'cadence-weekly-review',
} as const;

/**
 * Rebuilds the three recurring routine reminders. Called after any settings
 * change so the schedule always matches what the user configured.
 */
export async function syncRoutineReminders(settings: UserSettings): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  const routineIds = new Set<string>(Object.values(ROUTINE_IDS));
  await Promise.all(
    scheduled
      .filter((n) => routineIds.has(String(n.content.data?.routine ?? '')))
      .map((n) => cancel(n.identifier)),
  );

  if (!settings.notifications.enabled) return;

  if (settings.notifications.dailyPlanning) {
    const minutes = timeToMinutes(settings.notifications.planningTime) ?? 8 * 60;
    await schedule(
      {
        title: 'Plan your day',
        body: 'Set your top three priorities before you start.',
        data: { kind: 'planning', routine: ROUTINE_IDS.planning },
      },
      {
        type: SchedulableTriggerInputTypes.DAILY,
        hour: Math.floor(minutes / 60),
        minute: minutes % 60,
      },
    );
  }

  if (settings.notifications.dailyReview) {
    const minutes = timeToMinutes(settings.notifications.reviewTime) ?? 21 * 60 + 30;
    await schedule(
      {
        title: 'Daily review',
        body: 'Close the day out — it takes about a minute.',
        data: { kind: 'review', routine: ROUTINE_IDS.review },
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
        body: 'See whether this week actually moved.',
        data: { kind: 'weekly', routine: ROUTINE_IDS.weekly },
      },
      {
        type: SchedulableTriggerInputTypes.WEEKLY,
        // expo-notifications weekday is 1-indexed with Sunday = 1.
        weekday: settings.weeklyReviewDay + 1,
        hour: 19,
        minute: 0,
      },
    );
  }
}

/** "2 habits left for today" nudge, scheduled for the early evening. */
export async function scheduleHabitCatchUp(
  remaining: number,
  settings: UserSettings,
  date: DateKey = todayKey(),
): Promise<string | null> {
  if (!settings.notifications.enabled || !settings.notifications.habitReminders) return null;
  if (remaining <= 0) return null;
  const fireAt = dateTimeToTimestamp(date, '19:30');
  if (fireAt <= Date.now()) return null;
  return schedule(
    {
      title: 'Habits pending',
      body: `${remaining} habit${remaining === 1 ? '' : 's'} left for today.`,
      data: { kind: 'habit-catchup' },
    },
    { type: SchedulableTriggerInputTypes.DATE, date: new Date(fireAt) },
  );
}

export async function listScheduled() {
  return Notifications.getAllScheduledNotificationsAsync().catch(() => []);
}
