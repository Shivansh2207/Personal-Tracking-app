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

import { Icon } from '@/components/ui/Icon';
import { Body, Caption, Eyebrow } from '@/components/ui/Text';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import type { Category, Priority, Task } from '@/types/models';
import { formatDuration, formatTime } from '@/utils/date';

const PRIORITY_TINTS: Record<Priority, keyof ReturnType<typeof useTheme>['semantic'] | null> = {
  critical: 'danger',
  high: 'warning',
  medium: null,
  low: null,
};

interface Props {
  task: Task;
  category?: Category | null;
  onToggle: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
  use24Hour?: boolean;
  showDate?: string | null;
  index?: number;
}

/**
 * The core row. Completion is instant and animated locally; the checkbox never
 * waits on a network round-trip.
 */
export function TaskCard({
  task,
  category,
  onToggle,
  onPress,
  onLongPress,
  use24Hour,
  showDate,
  index,
}: Props) {
  const { c, space, accent, semantic, radius } = useTheme();
  const completed = task.status === 'completed';
  const skipped = task.status === 'skipped';

  const scale = useSharedValue(1);
  const fill = useSharedValue(completed ? 1 : 0);

  useEffect(() => {
    fill.value = withTiming(completed ? 1 : 0, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [completed, fill]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fill.value > 0.5 ? accent.base : 'transparent',
    borderColor: fill.value > 0.5 ? accent.base : c.lineStrong,
  }));

  const priorityTint = PRIORITY_TINTS[task.priority];
  const meta: string[] = [];
  if (category) meta.push(category.name);
  if (showDate) meta.push(showDate);
  if (task.startTime) meta.push(formatTime(task.startTime, use24Hour));
  if (task.estimatedMinutes) meta.push(formatDuration(task.estimatedMinutes));
  if (task.parentRecurringTaskId || task.recurrenceRule) meta.push('Repeats');

  const handleToggle = () => {
    scale.value = withSequence(
      withTiming(0.82, { duration: 90 }),
      withTiming(1, { duration: 140, easing: Easing.out(Easing.back(2)) }),
    );
    Haptics.impactAsync(
      completed ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    ).catch(() => {});
    onToggle();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      accessibilityHint="Opens task details"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: space.md,
        paddingVertical: space.md,
        paddingHorizontal: space.base,
        backgroundColor: pressed ? c.surface3 : 'transparent',
        opacity: skipped ? 0.45 : 1,
      })}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        accessibilityLabel={`Mark ${task.title} ${completed ? 'not done' : 'done'}`}
        hitSlop={12}
        onPress={handleToggle}
        style={{ paddingTop: 1 }}>
        <Animated.View
          style={[
            {
              width: 22,
              height: 22,
              borderRadius: radius.none,
              borderWidth: StyleSheet.hairlineWidth * 3,
              alignItems: 'center',
              justifyContent: 'center',
            },
            boxStyle,
          ]}>
          {completed ? <Icon name="check" size={14} color={accent.on} /> : null}
        </Animated.View>
      </Pressable>

      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          {index !== undefined ? (
            <Eyebrow color={accent.base}>{String(index).padStart(2, '0')}</Eyebrow>
          ) : null}
          <Body
            style={{
              flex: 1,
              textDecorationLine: completed || skipped ? 'line-through' : 'none',
            }}
            tone={completed || skipped ? 'faint' : 'default'}
            numberOfLines={2}>
            {task.title}
          </Body>
          {task.isTopPriority ? <Icon name="bookmark" size={13} color={accent.base} /> : null}
        </View>

        {meta.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {category ? (
              <View
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: category.color,
                }}
              />
            ) : null}
            <Caption tone="faint" numberOfLines={1} style={{ flex: 1 }}>
              {meta.join('  ·  ')}
            </Caption>
          </View>
        ) : null}

        {task.subtasks.length > 0 ? (
          <Caption tone="faint">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} subtasks
          </Caption>
        ) : null}
      </View>

      {priorityTint ? (
        <View
          accessibilityLabel={`${task.priority} priority`}
          style={{
            width: 3,
            alignSelf: 'stretch',
            backgroundColor: withAlpha(semantic[priorityTint], 0.8),
          }}
        />
      ) : null}
    </Pressable>
  );
}

/** Compact one-line variant used in history and search. */
export function TaskRow({
  task,
  category,
  onPress,
}: {
  task: Task;
  category?: Category | null;
  onPress?: () => void;
}) {
  const { c, space, semantic } = useTheme();
  const done = task.status === 'completed';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={task.title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: TOUCH_MIN,
        paddingVertical: space.sm,
        paddingHorizontal: space.base,
        backgroundColor: pressed ? c.surface3 : 'transparent',
      })}>
      <Icon
        name={done ? 'check-circle' : task.status === 'skipped' ? 'slash' : 'circle'}
        size={15}
        color={done ? semantic.success : c.text30}
      />
      <Body style={{ flex: 1 }} tone={done ? 'faint' : 'default'} numberOfLines={1}>
        {task.title}
      </Body>
      {category ? <Caption tone="faint">{category.name}</Caption> : null}
    </Pressable>
  );
}
