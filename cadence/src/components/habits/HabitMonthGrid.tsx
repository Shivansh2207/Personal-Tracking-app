import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SegmentBar } from '@/components/ui/Progress';
import { Caption, Eyebrow, MetricSmall } from '@/components/ui/Text';
import {
  HabitEvaluationContext,
  calculateHabitConsistency,
  groupLogsByHabit,
  indexLogsByDate,
  isHabitRequiredOn,
  isLogComplete,
} from '@/services/analytics/habits';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { DateKey, Habit, HabitLog } from '@/types/models';
import { dateRange, endOfMonth, fromDateKey, startOfMonth } from '@/utils/date';

interface Props {
  habits: Habit[];
  logs: HabitLog[];
  month: DateKey;
  weekStart: 0 | 1;
  today: DateKey;
  onSelectHabit?: (habit: Habit) => void;
  onToggleCell?: (habit: Habit, date: DateKey, currentlyComplete: boolean) => void;
}

const CELL = 16;
const GAP = 3;
const NAME_WIDTH = 96;

/**
 * Monthly habit grid.
 *
 * Three distinct states are drawn, because "not scheduled" and "missed" mean
 * very different things: filled (done), hollow outline (scheduled and missed),
 * flat inset (not scheduled). Rest days get their own muted marker.
 */
export function HabitMonthGrid({
  habits,
  logs,
  month,
  weekStart,
  today,
  onSelectHabit,
  onToggleCell,
}: Props) {
  const { c, accent, space } = useTheme();
  const days = useMemo(
    () => dateRange(startOfMonth(month), endOfMonth(month)),
    [month],
  );
  const grouped = useMemo(() => groupLogsByHabit(logs), [logs]);

  if (habits.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row' }}>
      <View style={{ width: NAME_WIDTH }}>
        <View style={{ height: 20 }} />
        {habits.map((habit) => (
          <Pressable
            key={habit.id}
            accessibilityRole="button"
            accessibilityLabel={`${habit.name} details`}
            onPress={() => onSelectHabit?.(habit)}
            style={{ height: CELL + GAP + 18, justifyContent: 'center', paddingRight: space.sm }}>
            <Caption numberOfLines={1}>{habit.name}</Caption>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row', gap: GAP, height: 20 }}>
            {days.map((day) => {
              const n = fromDateKey(day).getDate();
              return (
                <View key={day} style={{ width: CELL, alignItems: 'center' }}>
                  {n % 5 === 0 || n === 1 ? (
                    <Caption tone="faint" style={{ fontSize: 9, lineHeight: 11 }}>
                      {n}
                    </Caption>
                  ) : null}
                </View>
              );
            })}
          </View>

          {habits.map((habit) => {
            const habitLogs = grouped.get(habit.id) ?? [];
            const ctx: HabitEvaluationContext = {
              logsByDate: indexLogsByDate(habitLogs),
              weekStart,
              today,
            };
            const tint = habit.color ?? accent.base;

            return (
              <View
                key={habit.id}
                style={{
                  flexDirection: 'row',
                  gap: GAP,
                  height: CELL + GAP + 18,
                  alignItems: 'center',
                }}>
                {days.map((day) => {
                  const log = ctx.logsByDate.get(day);
                  const done = isLogComplete(log, habit);
                  const skipped = log?.status === 'skipped';
                  const future = day > today;
                  const beforeStart = day < habit.startDate;
                  const required = !future && !beforeStart && isHabitRequiredOn(habit, day, ctx);
                  const missed = required && !done && !skipped && day < today;

                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={`${habit.name} ${day}: ${
                        done ? 'done' : skipped ? 'rest day' : missed ? 'missed' : 'not scheduled'
                      }`}
                      disabled={future || beforeStart || !onToggleCell}
                      onPress={() => onToggleCell?.(habit, day, done)}
                      style={{
                        width: CELL,
                        height: CELL,
                        backgroundColor: done ? tint : skipped ? c.inset : 'transparent',
                        borderWidth: missed ? StyleSheet.hairlineWidth * 3 : 0,
                        borderColor: withAlpha(tint, 0.35),
                        opacity: future || beforeStart ? 0.35 : 1,
                        ...(!done && !skipped && !missed
                          ? { backgroundColor: withAlpha(c.text30, 0.12) }
                          : null),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      {skipped ? (
                        <View style={{ width: 5, height: 1.5, backgroundColor: c.text40 }} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Completion meter rendered next to the grid. */
export function HabitCompletionColumn({
  habits,
  logs,
  month,
  weekStart,
  today,
}: {
  habits: Habit[];
  logs: HabitLog[];
  month: DateKey;
  weekStart: 0 | 1;
  today: DateKey;
}) {
  const { space } = useTheme();
  const range = useMemo(() => dateRange(startOfMonth(month), endOfMonth(month)), [month]);
  const grouped = useMemo(() => groupLogsByHabit(logs), [logs]);

  return (
    <View style={{ gap: space.sm }}>
      {habits.map((habit) => {
        const consistency = calculateHabitConsistency(
          habit,
          range,
          grouped.get(habit.id) ?? [],
          weekStart,
          today,
        );
        return (
          <View
            key={habit.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Caption style={{ width: 96 }} numberOfLines={1}>
              {habit.name}
            </Caption>
            <SegmentBar value={consistency.rate} color={habit.color ?? undefined} style={{ flex: 1 }} />
            <MetricSmall tone="strong" style={{ width: 46, textAlign: 'right' }}>
              {consistency.rate}%
            </MetricSmall>
          </View>
        );
      })}
    </View>
  );
}

export function GridLegend() {
  const { c, accent, space } = useTheme();
  const items = [
    { label: 'Done', style: { backgroundColor: accent.base } },
    {
      label: 'Missed',
      style: {
        borderWidth: StyleSheet.hairlineWidth * 3,
        borderColor: withAlpha(accent.base, 0.35),
      },
    },
    { label: 'Not scheduled', style: { backgroundColor: withAlpha(c.text30, 0.12) } },
    { label: 'Rest', style: { backgroundColor: c.inset } },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={[{ width: 11, height: 11 }, item.style]} />
          <Eyebrow tone="faint">{item.label}</Eyebrow>
        </View>
      ))}
    </View>
  );
}
