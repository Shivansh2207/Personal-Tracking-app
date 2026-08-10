import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { ActivityRow } from '@/components/today/ActivityRow';
import { TimeLogSheet, WakeCard } from '@/components/today/WakeCard';
import {
  ClearDay,
  UpNextCard,
  UpNextItem,
  revisionToUpNext,
  routineToUpNext,
  selectUpNext,
  slotToUpNext,
  taskToUpNext,
} from '@/components/today/UpNext';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { Chip, ChipGroup } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon } from '@/components/ui/Icon';
import { GUTTER, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { OfflineBanner, SkeletonCard } from '@/components/ui/States';
import { Body, Caption, Display, Eyebrow, MetricSmall, Title } from '@/components/ui/Text';
import { isSleep, isWake } from '@/services/summaryService';
import { carryForwardTasks, fetchPendingBefore } from '@/services/taskService';
import { resolveSlotsForDate } from '@/services/timetableService';
import { sortTasks } from '@/services/analytics/tasks';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { Routine, Task } from '@/types/models';
import {
  DAY_PART_LABELS,
  DAY_PART_ORDER,
  DayPart,
  addDays,
  dayPartForTime,
  formatDuration,
  formatLongDate,
  greetingForHour,
  timeToMinutes,
  todayKey,
} from '@/utils/date';

export default function Today() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const profile = useAuthStore((s) => s.profile);
  const uid = useAuthStore((s) => s.user?.uid ?? null);

  const {
    categories,
    subjects,
    chapters,
    slots,
    dueRevisions,
    daySessions,
    loading,
    hydrated,
    error,
    offline,
    activeDate,
    setActiveDate,
    routineSnapshots,
    visibleTasks,
    toggleRoutine,
    adjustRoutine,
    logRoutineTime,
    skipRoutine,
    toggleTask,
    recomputeNow,
  } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);
  const [routineSheet, setRoutineSheet] = useState<Routine | null>(null);
  const [timeSheetFor, setTimeSheetFor] = useState<Routine | null>(null);
  const [missed, setMissed] = useState<Task[]>([]);
  const [missedOpen, setMissedOpen] = useState(false);
  const [nowMinutes, setNowMinutes] = useState(currentMinutes());

  const today = todayKey();
  const isToday = activeDate === today;

  // Keep Today pinned to the real day and roll over at midnight.
  useEffect(() => {
    if (activeDate !== today) setActiveDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  useEffect(() => {
    const timer = setInterval(() => setNowMinutes(currentMinutes()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const snapshots = routineSnapshots();
  const tasks = useMemo(() => sortTasks(visibleTasks()), [visibleTasks]);
  const categoryById = useMemo(() => new Map(categories.map((c2) => [c2.id, c2])), [categories]);

  const wakeSnapshot = snapshots.find(
    (s) => s.routine.trackingType === 'time' && isWake(s.routine.name),
  );
  const sleepSnapshot = snapshots.find(
    (s) => s.routine.trackingType === 'time' && isSleep(s.routine.name),
  );
  const routineRows = snapshots.filter((s) => s !== wakeSnapshot && s !== sleepSnapshot);

  const resolvedSlots = useMemo(
    () => resolveSlotsForDate(slots, activeDate, subjects, chapters, daySessions, nowMinutes),
    [slots, activeDate, subjects, chapters, daySessions, nowMinutes],
  );

  const dueToday = dueRevisions.filter((r) => r.dueDateKey <= today);

  // ---- Up Next ------------------------------------------------------------
  const upNext = useMemo(() => {
    const items: UpNextItem[] = [];

    for (const slot of resolvedSlots) {
      if (slot.status === 'completed') continue;
      items.push(
        slotToUpNext(slot, settings.use24HourTime, () => {
          if (slot.status === 'missed') {
            // A missed slot is rescheduled by logging the study when it happens,
            // so send the user to the manual log pre-filled with the slot.
            router.push(
              `/study/log?slotId=${slot.slot.id}&subjectId=${slot.slot.subjectId}` +
                (slot.chapter ? `&chapterId=${slot.chapter.id}` : '') +
                `&minutes=${slot.slot.durationMinutes}`,
            );
          } else {
            router.push(
              `/focus/setup?slotId=${slot.slot.id}` +
                `&subjectId=${slot.slot.subjectId}` +
                (slot.chapter ? `&chapterId=${slot.chapter.id}` : '') +
                `&minutes=${slot.slot.durationMinutes}`,
            );
          }
        }),
      );
    }

    for (const task of tasks) {
      if (task.status !== 'pending') continue;
      items.push(
        taskToUpNext(task, nowMinutes, settings.use24HourTime, () =>
          router.push(`/task/${encodeURIComponent(task.id)}`),
        ),
      );
    }

    for (const snapshot of routineRows) {
      if (!snapshot.due || snapshot.status === 'completed') continue;
      items.push(
        routineToUpNext(snapshot, nowMinutes, settings.use24HourTime, () =>
          setRoutineSheet(snapshot.routine),
        ),
      );
    }

    for (const revision of dueToday) {
      const chapter = chapters.find((ch) => ch.id === revision.chapterId);
      const subject = subjects.find((s) => s.id === revision.subjectId);
      items.push(
        revisionToUpNext(revision, chapter?.name ?? 'Chapter', subject?.name ?? '', () =>
          router.push('/study/revision'),
        ),
      );
    }

    return selectUpNext(items, nowMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedSlots, tasks, routineRows, dueToday, nowMinutes, settings.use24HourTime]);

  // ---- Missed work from previous days ------------------------------------
  const loadMissed = useCallback(async () => {
    if (!uid) return;
    const pending = await fetchPendingBefore(uid, today).catch(() => [] as Task[]);
    setMissed(pending);
    if (settings.autoCarryTasks && pending.length > 0) {
      const yesterday = addDays(today, -1);
      const count = await carryForwardTasks(uid, yesterday, today).catch(() => 0);
      if (count > 0) {
        toast.show(`${count} unfinished task${count === 1 ? '' : 's'} moved to today.`);
        recomputeNow(yesterday);
        recomputeNow(today);
        setMissed([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, today, settings.autoCarryTasks]);

  useFocusEffect(
    useCallback(() => {
      loadMissed();
    }, [loadMissed]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await recomputeNow(activeDate);
    await loadMissed();
    setRefreshing(false);
  }, [recomputeNow, activeDate, loadMissed]);

  // ---- Timeline grouping --------------------------------------------------
  interface TimelineEntry {
    key: string;
    minutes: number | null;
    node: React.ReactNode;
  }

  const grouped = useMemo(() => {
    const map: Record<DayPart, TimelineEntry[]> = {
      morning: [],
      afternoon: [],
      evening: [],
      night: [],
      anytime: [],
    };

    for (const snapshot of routineRows) {
      const part = snapshot.routine.dayPart ?? dayPartForTime(snapshot.routine.preferredTime);
      map[part].push({
        key: `routine-${snapshot.routine.id}`,
        minutes: timeToMinutes(snapshot.routine.preferredTime),
        node: (
          <ActivityRow
            snapshot={snapshot}
            category={categoryById.get(snapshot.routine.categoryId ?? '')}
            use24Hour={settings.use24HourTime}
            onToggle={() => toggleRoutine(snapshot.routine)}
            onAdjust={(delta) => adjustRoutine(snapshot.routine, delta)}
            onLogTime={() => setTimeSheetFor(snapshot.routine)}
            onStartTimer={() =>
              router.push(
                `/focus/setup?routineId=${snapshot.routine.id}` +
                  `&minutes=${snapshot.routine.targetValue ?? settings.defaultStudyMinutes}`,
              )
            }
            onOpen={() => setRoutineSheet(snapshot.routine)}
          />
        ),
      });
    }

    for (const slot of resolvedSlots) {
      const part = dayPartForTime(slot.slot.startTime);
      map[part].push({
        key: `slot-${slot.slot.id}`,
        minutes: slot.startMinutes,
        node: (
          <SlotRow
            slotStatus={slot.status}
            title={slot.subject?.name ?? 'Study'}
            chapter={slot.chapter?.name ?? null}
            time={slot.slot.startTime}
            minutes={slot.slot.durationMinutes}
            actual={slot.actualMinutes}
            onPress={() =>
              router.push(
                `/focus/setup?slotId=${slot.slot.id}` +
                  `&subjectId=${slot.slot.subjectId}` +
                  (slot.chapter ? `&chapterId=${slot.chapter.id}` : '') +
                  `&minutes=${slot.slot.durationMinutes}`,
              )
            }
          />
        ),
      });
    }

    for (const task of tasks) {
      const part = dayPartForTime(task.startTime);
      map[part].push({
        key: `task-${task.id}`,
        minutes: timeToMinutes(task.startTime),
        node: (
          <TaskRow
            task={task}
            categoryName={categoryById.get(task.categoryId ?? '')?.name ?? null}
            categoryColor={categoryById.get(task.categoryId ?? '')?.color ?? null}
            use24Hour={settings.use24HourTime}
            onToggle={() => toggleTask(task)}
            onPress={() => router.push(`/task/${encodeURIComponent(task.id)}`)}
          />
        ),
      });
    }

    for (const part of DAY_PART_ORDER) {
      map[part].sort((a, b) => {
        if (a.minutes === null && b.minutes === null) return 0;
        if (a.minutes === null) return 1;
        if (b.minutes === null) return -1;
        return a.minutes - b.minutes;
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routineRows, resolvedSlots, tasks, categoryById, settings.use24HourTime]);

  const totalEntries = DAY_PART_ORDER.reduce((a, part) => a + grouped[part].length, 0);
  const studyMinutes = daySessions.reduce((a, s) => a + s.actualMinutes, 0);
  const doneRoutines = routineRows.filter((s) => s.status === 'completed').length;
  const dueRoutines = routineRows.filter((s) => s.due).length;
  const doneTasks = tasks.filter((t) => t.status === 'completed').length;

  return (
    <Screen>
      <OfflineBanner visible={offline} message={error ?? undefined} />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
        }}>
        <View style={{ flex: 1 }}>
          <Caption tone="faint">{greetingForHour()}</Caption>
          <Display tone="strong" numberOfLines={1}>
            {firstName(profile?.name)}
          </Display>
        </View>
        <IconButton icon="search" label="Search" onPress={() => router.push('/search')} size={40} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          onPress={() => router.push('/(tabs)/you')}
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: withAlpha(accent.base, 0.16),
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: withAlpha(accent.base, 0.4),
          }}>
          <Eyebrow color={accent.base} style={{ fontSize: 12, letterSpacing: 0.5 }}>
            {initials(profile?.name)}
          </Eyebrow>
        </Pressable>
      </View>

      <ScreenScroll
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent.base} />
        }>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingBottom: space.md,
          }}>
          <Caption tone="faint" style={{ flex: 1 }}>
            {formatLongDate(activeDate)}
          </Caption>
          {dueRoutines > 0 || tasks.length > 0 || studyMinutes > 0 ? (
            <Caption tone="faint">
              {doneRoutines}/{dueRoutines} routines · {doneTasks}/{tasks.length} tasks
              {studyMinutes > 0 ? ` · ${formatDuration(studyMinutes)}` : ''}
            </Caption>
          ) : null}
        </View>

        {loading && !hydrated ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </View>
        ) : (
          <View style={{ gap: space.xl }}>
            {wakeSnapshot ? (
              <WakeCard
                snapshot={wakeSnapshot}
                toleranceMinutes={settings.wakeToleranceMinutes}
                use24Hour={settings.use24HourTime}
                onLog={(time) => logRoutineTime(wakeSnapshot.routine, time)}
              />
            ) : null}

            {sleepSnapshot && settings.trackSleep ? (
              <WakeCard
                snapshot={sleepSnapshot}
                variant="sleep"
                toleranceMinutes={settings.wakeToleranceMinutes}
                use24Hour={settings.use24HourTime}
                onLog={(time) => logRoutineTime(sleepSnapshot.routine, time)}
              />
            ) : null}

            {missed.length > 0 && !settings.autoCarryTasks ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${missed.length} unfinished tasks from earlier`}
                onPress={() => setMissedOpen(true)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.base,
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  borderRadius: radius.card,
                  backgroundColor: pressed ? c.surface3 : c.surface2,
                })}>
                <Icon name="corner-down-right" size={16} color={c.text40} />
                <Body tone="muted" style={{ flex: 1, fontSize: 13 }}>
                  {missed.length} unfinished task{missed.length === 1 ? '' : 's'} from earlier
                </Body>
                <Eyebrow color={accent.base}>Review</Eyebrow>
              </Pressable>
            ) : null}

            {upNext ? (
              <UpNextCard item={upNext} />
            ) : totalEntries === 0 ? (
              <ClearDay message="Nothing scheduled. Enjoy the space, or add something." />
            ) : (
              <ClearDay message="Everything scheduled is done. Nice." />
            )}

            {totalEntries === 0 ? (
              <View style={{ gap: space.md }}>
                <Button
                  label="Add a task"
                  icon="plus"
                  variant="outline"
                  full
                  onPress={() => router.push('/task/new')}
                />
                <Button
                  label="Create a routine"
                  icon="repeat"
                  variant="outline"
                  full
                  onPress={() => router.push('/routine/new')}
                />
              </View>
            ) : (
              DAY_PART_ORDER.map((part) => {
                const entries = grouped[part];
                if (entries.length === 0) return null;
                return (
                  <View key={part}>
                    <SectionHeader title={DAY_PART_LABELS[part]} meta={`${entries.length}`} />
                    <View
                      style={{
                        borderWidth: StyleSheet.hairlineWidth * 2,
                        borderColor: c.line,
                        borderRadius: radius.card,
                        overflow: 'hidden',
                        backgroundColor: c.surface2,
                      }}>
                      {entries.map((entry, index) => (
                        <View key={entry.key}>
                          {index > 0 ? (
                            <View
                              style={{
                                height: StyleSheet.hairlineWidth * 2,
                                backgroundColor: c.line,
                                marginLeft: space.h1 + 6,
                              }}
                            />
                          ) : null}
                          {entry.node}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}

            <View style={{ gap: space.md }}>
              <SectionHeader title="Quick actions" />
              <ChipGroup>
                <Chip label="Log study" icon="book" onPress={() => router.push('/study/log')} />
                <Chip label="Start focus" icon="play" onPress={() => router.push('/focus/setup')} />
                <Chip label="Quick log" icon="zap" onPress={() => router.push('/quick-log')} />
                <Chip
                  label="End of day"
                  icon="moon"
                  onPress={() => router.push(`/review/daily?date=${activeDate}`)}
                />
              </ChipGroup>
            </View>
          </View>
        )}
      </ScreenScroll>

      {/* Routine options */}
      <BottomSheet
        visible={!!routineSheet}
        onClose={() => setRoutineSheet(null)}
        title={routineSheet?.name}
        eyebrow="Routine">
        <View style={{ gap: space.sm, paddingBottom: space.base }}>
          <Button
            label="Mark done"
            full
            onPress={() => {
              if (routineSheet) toggleRoutine(routineSheet);
              setRoutineSheet(null);
            }}
          />
          <Button
            label="Rest day (not counted as missed)"
            variant="outline"
            full
            onPress={() => {
              if (routineSheet) skipRoutine(routineSheet, true);
              setRoutineSheet(null);
            }}
          />
          <Button
            label="Skip today"
            variant="outline"
            full
            onPress={() => {
              if (routineSheet) skipRoutine(routineSheet, false);
              setRoutineSheet(null);
            }}
          />
          <Button
            label="Open routine"
            variant="ghost"
            full
            onPress={() => {
              const id = routineSheet?.id;
              setRoutineSheet(null);
              if (id) router.push(`/routine/${id}`);
            }}
          />
        </View>
      </BottomSheet>

      {/* Time logging for `time` routines that are not wake/sleep */}
      <TimeLogSheet
        visible={!!timeSheetFor}
        title={timeSheetFor?.name ?? ''}
        initial={
          timeSheetFor
            ? (snapshots.find((s) => s.routine.id === timeSheetFor.id)?.log?.actualTime ?? null)
            : null
        }
        use24Hour={settings.use24HourTime}
        onClose={() => setTimeSheetFor(null)}
        onSave={(time) => {
          if (timeSheetFor) logRoutineTime(timeSheetFor, time);
          setTimeSheetFor(null);
        }}
      />

      {/* Missed tasks */}
      <BottomSheet
        visible={missedOpen}
        onClose={() => setMissedOpen(false)}
        title="Unfinished earlier"
        eyebrow={`${missed.length} task${missed.length === 1 ? '' : 's'}`}>
        <View style={{ gap: space.sm, paddingBottom: space.base }}>
          <Body tone="muted" style={{ fontSize: 13 }}>
            Moving a task keeps the same record — nothing is duplicated.
          </Body>
          {missed.slice(0, 6).map((task) => (
            <View
              key={task.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                padding: space.md,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
                borderRadius: radius.card,
              }}>
              <Icon name="circle" size={13} color={c.text30} />
              <Body style={{ flex: 1 }} numberOfLines={1}>
                {task.title}
              </Body>
              <Caption tone="faint">{task.dateKey}</Caption>
            </View>
          ))}
          <Button
            label="Move all to today"
            full
            onPress={async () => {
              if (!uid) return;
              const dates = [...new Set(missed.map((t) => t.dateKey).filter(Boolean))] as string[];
              let moved = 0;
              for (const date of dates) {
                moved += await carryForwardTasks(uid, date, today).catch(() => 0);
                recomputeNow(date);
              }
              recomputeNow(today);
              setMissed([]);
              setMissedOpen(false);
              toast.show(moved > 0 ? `${moved} moved to today.` : 'Nothing to move.');
            }}
          />
          <Button
            label="Open the plan instead"
            variant="ghost"
            full
            onPress={() => {
              setMissedOpen(false);
              router.push('/(tabs)/plan');
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function SlotRow({
  slotStatus,
  title,
  chapter,
  time,
  minutes,
  actual,
  onPress,
}: {
  slotStatus: string;
  title: string;
  chapter: string | null;
  time: string;
  minutes: number;
  actual: number;
  onPress: () => void;
}) {
  const { c, space, accent, semantic } = useTheme();
  const done = slotStatus === 'completed';
  const tone = done ? semantic.success : slotStatus === 'missed' ? semantic.warning : accent.base;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} study slot at ${time}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.base,
        backgroundColor: pressed ? c.surface3 : 'transparent',
      })}>
      <View
        style={{
          width: 30,
          height: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withAlpha(tone, 0.15),
        }}>
        <Icon name={done ? 'check' : 'book'} size={15} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body numberOfLines={1}>{title}</Body>
        <Caption tone="faint" numberOfLines={1}>
          {[chapter, `${time} · ${minutes} min`, actual > 0 ? `${actual} min done` : null]
            .filter(Boolean)
            .join('  ·  ')}
        </Caption>
      </View>
      <MetricSmall tone={done ? 'accent' : 'meta'}>{done ? 'Done' : 'Start'}</MetricSmall>
    </Pressable>
  );
}

function TaskRow({
  task,
  categoryName,
  categoryColor,
  use24Hour,
  onToggle,
  onPress,
}: {
  task: Task;
  categoryName: string | null;
  categoryColor: string | null;
  use24Hour: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const { c, space, accent } = useTheme();
  const done = task.status === 'completed';
  const skipped = task.status === 'skipped';

  const meta = [
    categoryName,
    task.startTime ? formatTimeSafe(task.startTime, use24Hour) : null,
    task.deadline ? 'Deadline' : null,
    task.carryCount ? `Moved ${task.carryCount}×` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.base,
        backgroundColor: pressed ? c.surface3 : 'transparent',
        opacity: skipped ? 0.5 : 1,
      })}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`Mark ${task.title} ${done ? 'not done' : 'done'}`}
        hitSlop={12}
        onPress={onToggle}
        style={{
          width: 26,
          height: 26,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: StyleSheet.hairlineWidth * 3,
          borderColor: done ? accent.base : c.lineStrong,
          backgroundColor: done ? accent.base : 'transparent',
        }}>
        {done ? <Icon name="check" size={15} color={accent.on} /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Body
          numberOfLines={1}
          tone={done || skipped ? 'faint' : 'default'}
          style={{ textDecorationLine: done || skipped ? 'line-through' : 'none' }}>
          {task.title}
        </Body>
        {meta ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {categoryColor ? (
              <View style={{ width: 6, height: 6, backgroundColor: categoryColor }} />
            ) : null}
            <Caption tone="faint" numberOfLines={1}>
              {meta}
            </Caption>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatTimeSafe(time: string, use24: boolean): string {
  const mins = timeToMinutes(time);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  if (use24) return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function initials(name?: string | null): string {
  if (!name) return 'D';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function firstName(name?: string | null): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}
