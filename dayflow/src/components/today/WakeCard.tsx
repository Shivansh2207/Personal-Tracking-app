import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Body, Caption, Eyebrow, MetricSmall } from '@/components/ui/Text';
import type { RoutineDaySnapshot } from '@/services/analytics/routines';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { TimeString } from '@/types/models';
import {
  clockDeviationMinutes,
  formatDeviation,
  formatTime,
  minutesToTime,
  timeToMinutes,
} from '@/utils/date';

interface Props {
  snapshot: RoutineDaySnapshot;
  toleranceMinutes: number;
  use24Hour: boolean;
  onLog: (time: TimeString) => void;
  variant?: 'wake' | 'sleep';
}

/**
 * The first interaction of the day. Tapping opens a picker preselected to the
 * current time, so logging a wake-up is two taps.
 */
export function WakeCard({
  snapshot,
  toleranceMinutes,
  use24Hour,
  onLog,
  variant = 'wake',
}: Props) {
  const { c, space, accent, radius, semantic } = useTheme();
  const [open, setOpen] = useState(false);

  const target = snapshot.routine.targetTime;
  const actual = snapshot.log?.actualTime ?? null;
  const deviation = clockDeviationMinutes(actual, target);
  const withinTarget = deviation !== null && Math.abs(deviation) <= toleranceMinutes;

  const title = variant === 'wake' ? 'Wake up' : 'Last night';
  const targetLabel = variant === 'wake' ? 'Target' : 'Target bedtime';

  return (
    <>
      <View
        style={{
          padding: space.base,
          gap: space.md,
          backgroundColor: c.surface2,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icon name={variant === 'wake' ? 'sunrise' : 'moon'} size={14} color={c.text40} />
          <Eyebrow tone="faint" style={{ flex: 1 }}>
            {title}
          </Eyebrow>
          {actual && withinTarget ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 3,
                paddingHorizontal: 7,
                backgroundColor: withAlpha(semantic.success, 0.12),
              }}>
              <Icon name="check" size={10} color={semantic.success} />
              <Caption color={semantic.success}>On target</Caption>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.xl }}>
          <View style={{ gap: 2 }}>
            <Eyebrow tone="faint">{targetLabel}</Eyebrow>
            <MetricSmall tone="meta" style={{ fontSize: 22, lineHeight: 24 }}>
              {target ? formatTime(target, use24Hour) : '—'}
            </MetricSmall>
          </View>
          <View style={{ gap: 2, flex: 1 }}>
            <Eyebrow tone="faint">Actual</Eyebrow>
            <MetricSmall
              tone="strong"
              color={actual && !withinTarget ? semantic.warning : undefined}
              style={{ fontSize: 30, lineHeight: 32 }}>
              {actual ? formatTime(actual, use24Hour) : '--:--'}
            </MetricSmall>
          </View>
        </View>

        {actual ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Caption tone="faint" style={{ flex: 1 }}>
              {formatDeviation(deviation, toleranceMinutes)}
              {deviation !== null && !withinTarget
                ? deviation > 0
                  ? ' later than target'
                  : ' earlier than target'
                : ''}
            </Caption>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit ${title} time`}
              onPress={() => setOpen(true)}
              hitSlop={8}>
              <Eyebrow color={accent.base}>Edit</Eyebrow>
            </Pressable>
          </View>
        ) : (
          <Button
            label={variant === 'wake' ? 'Log wake time' : 'Log bedtime'}
            full
            icon="clock"
            onPress={() => setOpen(true)}
          />
        )}
      </View>

      <TimeLogSheet
        visible={open}
        title={variant === 'wake' ? 'Wake time' : 'Bedtime'}
        initial={actual}
        use24Hour={use24Hour}
        onClose={() => setOpen(false)}
        onSave={(time) => {
          onLog(time);
          setOpen(false);
        }}
      />
    </>
  );
}

/**
 * Time picker that opens on the current time. Coarse steps first (quarter
 * hours) with fine adjustment, which is faster on a phone than a wheel.
 */
export function TimeLogSheet({
  visible,
  title,
  initial,
  use24Hour,
  onClose,
  onSave,
}: {
  visible: boolean;
  title: string;
  initial: TimeString | null;
  use24Hour: boolean;
  onClose: () => void;
  onSave: (time: TimeString) => void;
}) {
  const { c, space, accent } = useTheme();
  const nowMinutes = () => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  };
  const [minutes, setMinutes] = useState<number>(timeToMinutes(initial) ?? nowMinutes());

  React.useEffect(() => {
    if (visible) setMinutes(timeToMinutes(initial) ?? nowMinutes());
  }, [visible, initial]);

  const adjust = (delta: number) => setMinutes((m) => ((m + delta) % 1440 + 1440) % 1440);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
      eyebrow="Log the actual time"
      footer={<Button label="Save" full onPress={() => onSave(minutesToTime(minutes))} />}>
      <View style={{ gap: space.lg, paddingBottom: space.base, alignItems: 'center' }}>
        <MetricSmall tone="strong" style={{ fontSize: 46, lineHeight: 48 }}>
          {formatTime(minutesToTime(minutes), use24Hour)}
        </MetricSmall>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {[-60, -15, -5, 5, 15, 60].map((delta) => (
            <Pressable
              key={delta}
              accessibilityRole="button"
              accessibilityLabel={`${delta > 0 ? 'Add' : 'Subtract'} ${Math.abs(delta)} minutes`}
              onPress={() => adjust(delta)}
              style={({ pressed }) => ({
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
                backgroundColor: pressed ? c.surface3 : 'transparent',
              })}>
              <Eyebrow tone="meta">
                {delta > 0 ? '+' : '−'}
                {Math.abs(delta)}
              </Eyebrow>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Use the current time"
          onPress={() => setMinutes(nowMinutes())}>
          <Body color={accent.base}>Use current time</Body>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
