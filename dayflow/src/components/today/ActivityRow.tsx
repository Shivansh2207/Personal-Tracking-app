import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon, resolveIcon } from '@/components/ui/Icon';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import type { RoutineDaySnapshot } from '@/services/analytics/routines';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import type { Category } from '@/types/models';
import { formatTime } from '@/utils/date';

export interface ActivityRowProps {
  snapshot: RoutineDaySnapshot;
  category?: Category | null;
  use24Hour?: boolean;
  onToggle: () => void;
  onAdjust: (delta: number) => void;
  onLogTime: () => void;
  onStartTimer: () => void;
  onOpen: () => void;
  /** Disabled for future days, where logging makes no sense. */
  readOnly?: boolean;
}

/**
 * One row per routine, rendering the interaction that matches its tracking
 * type. Every variant completes without navigating away — that is the whole
 * point of the daily-logging loop.
 */
export function ActivityRow(props: ActivityRowProps) {
  const { snapshot } = props;
  switch (snapshot.routine.trackingType) {
    case 'count':
      return <CountActivity {...props} />;
    case 'duration':
      return <DurationActivity {...props} />;
    case 'time':
      return <TimeActivity {...props} />;
    case 'session':
      return <SessionActivity {...props} />;
    case 'numeric':
      return <NumericActivity {...props} />;
    default:
      return <CheckActivity {...props} />;
  }
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

function Shell({
  snapshot,
  category,
  right,
  subtitle,
  onOpen,
  leading,
}: {
  snapshot: RoutineDaySnapshot;
  category?: Category | null;
  right: React.ReactNode;
  subtitle?: string | null;
  onOpen: () => void;
  leading?: React.ReactNode;
}) {
  const { c, space } = useTheme();
  const { routine } = snapshot;
  const skipped = snapshot.status === 'skipped' || snapshot.status === 'rest';

  const meta = [
    category?.name,
    routine.preferredTime ? routine.preferredTime : null,
    !snapshot.due && snapshot.status === 'pending' ? 'Optional today' : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={routine.name}
      accessibilityHint="Opens routine details"
      onLongPress={onOpen}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.base,
        minHeight: TOUCH_MIN + 12,
        backgroundColor: pressed ? c.surface3 : 'transparent',
        opacity: skipped ? 0.5 : 1,
      })}>
      {leading ?? (
        <View
          style={{
            width: 30,
            height: 30,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.inset,
          }}>
          <Icon name={resolveIcon(routine.icon)} size={15} color={c.text50} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Body numberOfLines={1}>{routine.name}</Body>
        {subtitle || meta ? (
          <Caption tone="faint" numberOfLines={1}>
            {[subtitle, meta].filter(Boolean).join('  ·  ')}
          </Caption>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

function CheckActivity({ snapshot, category, onToggle, onOpen }: ActivityRowProps) {
  const { c, accent } = useTheme();
  const done = snapshot.status === 'completed';
  const scale = useSharedValue(1);
  const fill = useSharedValue(done ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(done ? 1 : 0, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [done, fill]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fill.value > 0.5 ? accent.base : 'transparent',
    borderColor: fill.value > 0.5 ? accent.base : c.lineStrong,
  }));

  return (
    <Shell
      snapshot={snapshot}
      category={category}
      onOpen={onOpen}
      right={
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={`Mark ${snapshot.routine.name} ${done ? 'not done' : 'done'}`}
          hitSlop={14}
          onPress={() => {
            scale.value = withSequence(
              withTiming(0.84, { duration: 80 }),
              withTiming(1, { duration: 150, easing: Easing.out(Easing.back(2.2)) }),
            );
            Haptics.impactAsync(
              done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
            ).catch(() => {});
            onToggle();
          }}>
          <Animated.View
            style={[
              {
                width: 26,
                height: 26,
                borderWidth: StyleSheet.hairlineWidth * 3,
                alignItems: 'center',
                justifyContent: 'center',
              },
              boxStyle,
            ]}>
            {done ? <Icon name="check" size={15} color={accent.on} /> : null}
          </Animated.View>
        </Pressable>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Count
// ---------------------------------------------------------------------------

function CountActivity({ snapshot, category, onAdjust, onOpen }: ActivityRowProps) {
  const { c, accent, space } = useTheme();
  const { routine } = snapshot;
  const target = snapshot.targetValue ?? 0;
  const actual = snapshot.actualValue;
  const ratio = target > 0 ? Math.min(1, actual / target) : 0;
  const step = target >= 40 ? 5 : 1;

  return (
    <View>
      <Shell
        snapshot={snapshot}
        category={category}
        onOpen={onOpen}
        subtitle={`${actual} / ${target}${routine.unit ? ` ${routine.unit}` : ''}`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <StepButton
              icon="minus"
              label={`Decrease ${routine.name}`}
              onPress={() => onAdjust(-step)}
              disabled={actual <= 0}
            />
            <View style={{ minWidth: 34, alignItems: 'center' }}>
              <Body tone={actual >= target && target > 0 ? 'accent' : 'default'}>{actual}</Body>
            </View>
            <StepButton icon="plus" label={`Add to ${routine.name}`} onPress={() => onAdjust(step)} />
            {step > 1 ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add five to ${routine.name}`}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onAdjust(5);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 8,
                  height: TOUCH_MIN - 8,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: StyleSheet.hairlineWidth * 2,
                  borderColor: c.line,
                  backgroundColor: pressed ? c.surface3 : 'transparent',
                })}>
                <Eyebrow tone="meta">+5</Eyebrow>
              </Pressable>
            )}
          </View>
        }
      />
      <View style={{ height: 3, backgroundColor: c.inset, marginHorizontal: space.base }}>
        <View
          style={{
            width: `${ratio * 100}%`,
            height: 3,
            backgroundColor: accent.base,
          }}
        />
      </View>
    </View>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        width: 34,
        height: TOUCH_MIN - 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.line,
        backgroundColor: pressed ? c.surface3 : 'transparent',
        opacity: disabled ? 0.35 : 1,
      })}>
      <Icon name={icon} size={14} color={c.text60} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

function DurationActivity({
  snapshot,
  category,
  onAdjust,
  onStartTimer,
  onOpen,
}: ActivityRowProps) {
  const { c, accent, space } = useTheme();
  const target = snapshot.targetValue ?? 0;
  const actual = snapshot.actualValue;
  const ratio = target > 0 ? Math.min(1, actual / target) : 0;

  return (
    <View>
      <Shell
        snapshot={snapshot}
        category={category}
        onOpen={onOpen}
        subtitle={`${actual} / ${target} min`}
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
            <StepButton
              icon="minus"
              label="Subtract 5 minutes"
              onPress={() => onAdjust(-5)}
              disabled={actual <= 0}
            />
            <StepButton icon="plus" label="Add 5 minutes" onPress={() => onAdjust(5)} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Start timer for ${snapshot.routine.name}`}
              onPress={onStartTimer}
              style={({ pressed }) => ({
                paddingHorizontal: 10,
                height: TOUCH_MIN - 8,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: withAlpha(accent.base, 0.5),
                backgroundColor: pressed ? c.surface3 : withAlpha(accent.base, 0.1),
              })}>
              <Eyebrow color={accent.base}>Start</Eyebrow>
            </Pressable>
          </View>
        }
      />
      <View style={{ height: 3, backgroundColor: c.inset, marginHorizontal: space.base }}>
        <View style={{ width: `${ratio * 100}%`, height: 3, backgroundColor: accent.base }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

function TimeActivity({ snapshot, category, onLogTime, onOpen, use24Hour }: ActivityRowProps) {
  const { c, accent } = useTheme();
  const logged = snapshot.log?.actualTime ?? null;

  return (
    <Shell
      snapshot={snapshot}
      category={category}
      onOpen={onOpen}
      subtitle={
        snapshot.routine.targetTime
          ? `Target ${formatTime(snapshot.routine.targetTime, use24Hour)}`
          : null
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            logged
              ? `${snapshot.routine.name} logged at ${formatTime(logged, use24Hour)}. Tap to change.`
              : `Log ${snapshot.routine.name} time`
          }
          onPress={onLogTime}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            minHeight: TOUCH_MIN - 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: logged ? withAlpha(accent.base, 0.5) : c.lineStrong,
            backgroundColor: pressed ? c.surface3 : 'transparent',
          })}>
          <Body tone={logged ? 'accent' : 'meta'}>
            {logged ? formatTime(logged, use24Hour) : 'Log'}
          </Body>
        </Pressable>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

function SessionActivity({ snapshot, category, onToggle, onOpen }: ActivityRowProps) {
  const { c, accent, space } = useTheme();
  const done = snapshot.periodDone ?? 0;
  const target = snapshot.periodTarget ?? 0;
  const completedToday = snapshot.status === 'completed';

  return (
    <Shell
      snapshot={snapshot}
      category={category}
      onOpen={onOpen}
      subtitle={`${done} / ${target} this ${
        snapshot.routine.schedule.type === 'times_per_month' ? 'month' : 'week'
      }`}
      leading={
        <View style={{ flexDirection: 'row', gap: 3, width: 30, flexWrap: 'wrap' }}>
          {Array.from({ length: Math.min(8, target) }, (_, i) => (
            <View
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i < done ? accent.base : c.inset,
              }}
            />
          ))}
        </View>
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: completedToday }}
          accessibilityLabel={
            completedToday
              ? `Remove today's ${snapshot.routine.name} session`
              : `Log a ${snapshot.routine.name} session`
          }
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onToggle();
          }}
          style={({ pressed }) => ({
            paddingHorizontal: space.md,
            minHeight: TOUCH_MIN - 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: completedToday ? withAlpha(accent.base, 0.55) : c.lineStrong,
            backgroundColor: completedToday
              ? withAlpha(accent.base, 0.14)
              : pressed
                ? c.surface3
                : 'transparent',
          })}>
          <Eyebrow color={completedToday ? accent.base : c.text60}>
            {completedToday ? 'Logged' : 'Log session'}
          </Eyebrow>
        </Pressable>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Numeric
// ---------------------------------------------------------------------------

function NumericActivity({ snapshot, category, onOpen }: ActivityRowProps) {
  const { c } = useTheme();
  const value = snapshot.log?.actualValue ?? null;
  return (
    <Shell
      snapshot={snapshot}
      category={category}
      onOpen={onOpen}
      subtitle="Measurement"
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Record ${snapshot.routine.name}`}
          onPress={onOpen}
          style={({ pressed }) => ({
            paddingHorizontal: 12,
            minHeight: TOUCH_MIN - 8,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.lineStrong,
            backgroundColor: pressed ? c.surface3 : 'transparent',
          })}>
          <Body tone={value === null ? 'meta' : 'default'}>
            {value === null ? 'Record' : `${value}${snapshot.routine.unit ? ` ${snapshot.routine.unit}` : ''}`}
          </Body>
        </Pressable>
      }
    />
  );
}
