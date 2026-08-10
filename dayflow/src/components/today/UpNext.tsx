import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Icon, IconName } from '@/components/ui/Icon';
import { Body, Caption, Eyebrow, Title } from '@/components/ui/Text';
import type { RoutineDaySnapshot } from '@/services/analytics/routines';
import type { ResolvedSlot } from '@/services/timetableService';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { RevisionItem, Task } from '@/types/models';
import { formatTime, minutesToTime, timeToMinutes } from '@/utils/date';

export type UpNextKind = 'slot' | 'task' | 'routine' | 'revision';

export interface UpNextItem {
  kind: UpNextKind;
  key: string;
  title: string;
  subtitle: string | null;
  timeLabel: string | null;
  /** Minutes since midnight the item is due at, when it has a time. */
  startMinutes: number | null;
  state: 'now' | 'next' | 'missed' | 'due';
  actionLabel: string;
  icon: IconName;
  onAction: () => void;
}

/**
 * Picks the single most relevant thing to surface right now.
 *
 * Priority order: something happening at this moment, then anything already
 * missed today, then the next scheduled item, then anything due but untimed.
 */
export function selectUpNext(items: UpNextItem[], nowMinutes: number): UpNextItem | null {
  if (items.length === 0) return null;

  const now = items.filter((i) => i.state === 'now');
  if (now.length > 0) return now[0];

  const missed = items
    .filter((i) => i.state === 'missed')
    .sort((a, b) => (b.startMinutes ?? 0) - (a.startMinutes ?? 0));
  if (missed.length > 0) return missed[0];

  const upcoming = items
    .filter((i) => i.state === 'next' && i.startMinutes !== null && i.startMinutes >= nowMinutes)
    .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
  if (upcoming.length > 0) return upcoming[0];

  const due = items.filter((i) => i.state === 'due');
  return due[0] ?? null;
}

export function UpNextCard({ item }: { item: UpNextItem }) {
  const { c, space, accent, radius, semantic } = useTheme();

  const tone =
    item.state === 'now' ? accent.base : item.state === 'missed' ? semantic.warning : c.text40;
  const label =
    item.state === 'now'
      ? 'Now'
      : item.state === 'missed'
        ? 'Missed'
        : item.state === 'due'
          ? 'Due today'
          : 'Up next';

  return (
    <View
      style={{
        padding: space.base,
        gap: space.md,
        backgroundColor: c.surface2,
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: item.state === 'now' ? withAlpha(accent.base, 0.5) : c.line,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 6, height: 6, backgroundColor: tone }} />
        <Eyebrow color={tone} style={{ flex: 1 }}>
          {label}
        </Eyebrow>
        {item.timeLabel ? <Eyebrow tone="faint">{item.timeLabel}</Eyebrow> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View
          style={{
            width: 38,
            height: 38,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.inset,
          }}>
          <Icon name={item.icon} size={17} color={tone} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Title tone="strong" numberOfLines={1}>
            {item.title}
          </Title>
          {item.subtitle ? (
            <Caption tone="faint" numberOfLines={1}>
              {item.subtitle}
            </Caption>
          ) : null}
        </View>
      </View>

      <Button
        label={item.actionLabel}
        full
        variant={item.state === 'missed' ? 'outline' : 'primary'}
        onPress={item.onAction}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export function slotToUpNext(
  slot: ResolvedSlot,
  use24Hour: boolean,
  onAction: () => void,
): UpNextItem {
  const state: UpNextItem['state'] =
    slot.status === 'now' ? 'now' : slot.status === 'missed' ? 'missed' : 'next';
  return {
    kind: 'slot',
    key: `slot-${slot.slot.id}`,
    title: slot.subject?.name ?? 'Study',
    subtitle: slot.chapter?.name ?? 'Choose a chapter',
    timeLabel: `${formatTime(minutesToTime(slot.startMinutes), use24Hour)} – ${formatTime(
      minutesToTime(slot.endMinutes),
      use24Hour,
    )}`,
    startMinutes: slot.startMinutes,
    state,
    actionLabel: state === 'missed' ? 'Reschedule' : 'Start study',
    icon: 'book',
    onAction,
  };
}

export function taskToUpNext(
  task: Task,
  nowMinutes: number,
  use24Hour: boolean,
  onAction: () => void,
): UpNextItem {
  const start = timeToMinutes(task.startTime);
  const state: UpNextItem['state'] =
    start === null
      ? 'due'
      : nowMinutes >= start && nowMinutes < start + 30
        ? 'now'
        : nowMinutes >= start + 30
          ? 'missed'
          : 'next';
  return {
    kind: 'task',
    key: `task-${task.id}`,
    title: task.title,
    subtitle: task.deadline ? 'Has a deadline' : null,
    timeLabel: task.startTime ? formatTime(task.startTime, use24Hour) : null,
    startMinutes: start,
    state,
    actionLabel: 'Open',
    icon: 'check-square',
    onAction,
  };
}

export function routineToUpNext(
  snapshot: RoutineDaySnapshot,
  nowMinutes: number,
  use24Hour: boolean,
  onAction: () => void,
): UpNextItem {
  const start = timeToMinutes(snapshot.routine.preferredTime);
  const state: UpNextItem['state'] =
    start === null
      ? 'due'
      : nowMinutes >= start && nowMinutes < start + 60
        ? 'now'
        : nowMinutes >= start + 60
          ? 'missed'
          : 'next';
  return {
    kind: 'routine',
    key: `routine-${snapshot.routine.id}`,
    title: snapshot.routine.name,
    subtitle: null,
    timeLabel: snapshot.routine.preferredTime
      ? formatTime(snapshot.routine.preferredTime, use24Hour)
      : null,
    startMinutes: start,
    state,
    actionLabel: 'Open',
    icon: 'repeat',
    onAction,
  };
}

export function revisionToUpNext(
  item: RevisionItem,
  chapterName: string,
  subjectName: string,
  onAction: () => void,
): UpNextItem {
  return {
    kind: 'revision',
    key: `revision-${item.id}`,
    title: `Revise ${chapterName}`,
    subtitle: subjectName,
    timeLabel: null,
    startMinutes: null,
    state: 'due',
    actionLabel: 'Start revision',
    icon: 'rotate-ccw',
    onAction,
  };
}

export function ClearDay({ message }: { message: string }) {
  const { c, space, radius } = useTheme();
  return (
    <View
      style={{
        padding: space.lg,
        alignItems: 'center',
        gap: space.sm,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderStyle: 'dashed',
        borderColor: c.line,
        borderRadius: radius.card,
      }}>
      <Icon name="coffee" size={20} color={c.text30} />
      <Body tone="faint" align="center">
        {message}
      </Body>
    </View>
  );
}
