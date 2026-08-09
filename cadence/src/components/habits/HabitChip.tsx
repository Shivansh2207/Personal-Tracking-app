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
import { Caption, Eyebrow } from '@/components/ui/Text';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import type { Habit } from '@/types/models';

interface Props {
  habit: Habit;
  completed: boolean;
  required: boolean;
  skipped?: boolean;
  value?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

/**
 * One-tap habit check-in for the dashboard row. The tick lands immediately with
 * a short spring; the write happens behind it.
 */
export function HabitChip({
  habit,
  completed,
  required,
  skipped,
  value,
  onPress,
  onLongPress,
}: Props) {
  const { c, accent, space, radius } = useTheme();
  const tint = habit.color ?? accent.base;
  const scale = useSharedValue(1);
  const progress = useSharedValue(completed ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(completed ? 1 : 0, { duration: 220 });
  }, [completed, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: progress.value > 0.5 ? withAlpha(tint, 0.6) : c.line,
    backgroundColor: progress.value > 0.5 ? withAlpha(tint, 0.14) : 'transparent',
  }));

  const statusLabel = skipped ? 'Rest day' : completed ? 'Done' : required ? 'Due' : 'Optional';

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: completed }}
      accessibilityLabel={`${habit.name}, ${statusLabel}`}
      accessibilityHint="Long press for options"
      onPress={() => {
        scale.value = withSequence(
          withTiming(0.9, { duration: 80 }),
          withTiming(1, { duration: 160, easing: Easing.out(Easing.back(2.4)) }),
        );
        Haptics.impactAsync(
          completed ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
        ).catch(() => {});
        onPress();
      }}
      onLongPress={onLongPress}>
      <Animated.View
        style={[
          {
            width: 84,
            minHeight: 92,
            paddingVertical: space.md,
            paddingHorizontal: space.sm,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderRadius: radius.card,
            opacity: skipped ? 0.45 : 1,
          },
          animatedStyle,
        ]}>
        <View
          style={{
            width: 30,
            height: 30,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.pill,
            backgroundColor: completed ? tint : c.inset,
          }}>
          <Icon
            name={completed ? 'check' : skipped ? 'moon' : resolveIcon(habit.icon)}
            size={15}
            color={completed ? accent.on : c.text50}
          />
        </View>
        <Caption
          tone={completed ? 'default' : 'meta'}
          numberOfLines={1}
          style={{ maxWidth: '100%' }}>
          {habit.name}
        </Caption>
        {habit.measurementType !== 'binary' ? (
          <Eyebrow tone="faint">
            {value ?? 0}/{habit.target}
          </Eyebrow>
        ) : !required && !completed ? (
          <Eyebrow tone="faint">Optional</Eyebrow>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/** Row variant with a counter, used on the Habits tracker screen. */
export function HabitRow({
  habit,
  completed,
  required,
  skipped,
  value,
  consistency,
  streak,
  onToggle,
  onIncrement,
  onPress,
}: {
  habit: Habit;
  completed: boolean;
  required: boolean;
  skipped?: boolean;
  value: number;
  consistency?: number;
  streak?: number;
  onToggle: () => void;
  onIncrement?: (delta: number) => void;
  onPress?: () => void;
}) {
  const { c, accent, space, radius } = useTheme();
  const tint = habit.color ?? accent.base;
  const measurable = habit.measurementType !== 'binary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={habit.name}
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
      <View
        style={{
          width: 34,
          height: 34,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.card,
          backgroundColor: completed ? withAlpha(tint, 0.18) : c.inset,
        }}>
        <Icon name={resolveIcon(habit.icon)} size={16} color={completed ? tint : c.text50} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Caption tone="default" style={{ fontSize: 14 }} numberOfLines={1}>
          {habit.name}
        </Caption>
        <Caption tone="faint">
          {[
            consistency !== undefined ? `${consistency}%` : null,
            streak ? `${streak} day streak` : null,
            !required && !completed ? 'Not due today' : null,
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </Caption>
      </View>

      {measurable && onIncrement ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${habit.name}`}
            hitSlop={8}
            onPress={() => onIncrement(-1)}
            style={{ width: 32, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="minus" size={15} color={c.text50} />
          </Pressable>
          <Caption tone="default" style={{ minWidth: 44, textAlign: 'center' }}>
            {value}/{habit.target}
          </Caption>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Increase ${habit.name}`}
            hitSlop={8}
            onPress={() => onIncrement(1)}
            style={{ width: 32, height: TOUCH_MIN, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={15} color={c.text50} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: completed }}
          accessibilityLabel={`Mark ${habit.name} ${completed ? 'not done' : 'done'}`}
          hitSlop={10}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onToggle();
          }}
          style={{
            width: 30,
            height: 30,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: StyleSheet.hairlineWidth * 3,
            borderColor: completed ? tint : c.lineStrong,
            backgroundColor: completed ? tint : 'transparent',
          }}>
          {completed ? <Icon name="check" size={15} color={accent.on} /> : null}
        </Pressable>
      )}
    </Pressable>
  );
}
