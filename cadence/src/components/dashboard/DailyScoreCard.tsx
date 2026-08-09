import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { Icon } from '@/components/ui/Icon';
import { ProgressRing } from '@/components/ui/Progress';
import { Body, Caption, Eyebrow, MetricHero, MetricSmall, Title } from '@/components/ui/Text';
import type { DailyScoreResult } from '@/services/analytics/score';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { formatDuration } from '@/utils/date';

interface Props {
  score: DailyScoreResult;
  tasksCompleted: number;
  tasksPlanned: number;
  habitsCompleted: number;
  habitsScheduled: number;
  focusMinutes: number;
  streak: number;
  threshold: number;
  isRestDay?: boolean;
}

/**
 * The command-centre metric. Tapping it opens the full derivation, so the score
 * is always explainable rather than a black box.
 */
export function DailyScoreCard({
  score,
  tasksCompleted,
  tasksPlanned,
  habitsCompleted,
  habitsScheduled,
  focusMinutes,
  streak,
  threshold,
  isRestDay,
}: Props) {
  const { c, accent, space, semantic, radius } = useTheme();
  const [open, setOpen] = useState(false);

  const reachedThreshold = score.score >= threshold;
  const ringColor = !score.hasData
    ? c.text30
    : reachedThreshold
      ? accent.base
      : withAlpha(accent.base, 0.65);

  const stats = [
    { label: 'Tasks', value: `${tasksCompleted}/${tasksPlanned}`, icon: 'check-square' as const },
    { label: 'Habits', value: `${habitsCompleted}/${habitsScheduled}`, icon: 'repeat' as const },
    { label: 'Focus', value: formatDuration(focusMinutes, '0m'), icon: 'clock' as const },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Today's score ${score.score} percent. Tap to see how it was calculated.`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          backgroundColor: pressed ? c.surface3 : c.surface2,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
          borderRadius: radius.card,
          padding: space.lg,
          gap: space.lg,
        })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
          <ProgressRing value={score.score} size={112} thickness={7} color={ringColor}>
            <View style={{ alignItems: 'center' }}>
              <MetricHero tone="strong" style={{ fontSize: 40, lineHeight: 40 }}>
                {score.hasData ? score.score : '—'}
              </MetricHero>
              {score.hasData ? <Eyebrow tone="faint">Percent</Eyebrow> : null}
            </View>
          </ProgressRing>

          <View style={{ flex: 1, gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Eyebrow tone="faint">Today</Eyebrow>
              <Icon name="info" size={11} color={c.text30} />
            </View>
            <Title tone="strong">
              {isRestDay
                ? 'Rest day'
                : !score.hasData
                  ? 'Nothing planned yet'
                  : reachedThreshold
                    ? 'On track'
                    : 'In progress'}
            </Title>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                alignSelf: 'flex-start',
                paddingVertical: 5,
                paddingHorizontal: 9,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: streak > 0 ? withAlpha(semantic.warning, 0.4) : c.line,
                backgroundColor: streak > 0 ? withAlpha(semantic.warning, 0.1) : 'transparent',
              }}>
              <Icon name="zap" size={12} color={streak > 0 ? semantic.warning : c.text40} />
              <Caption color={streak > 0 ? semantic.warning : c.text40}>
                {streak > 0 ? `${streak} day streak` : 'No streak yet'}
              </Caption>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={{
                flex: 1,
                gap: 4,
                paddingVertical: space.md,
                paddingHorizontal: space.sm,
                backgroundColor: c.surface2,
                alignItems: 'center',
              }}>
              <Eyebrow tone="faint">{stat.label}</Eyebrow>
              <MetricSmall tone="strong">{stat.value}</MetricSmall>
            </View>
          ))}
        </View>
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="How this was calculated"
        eyebrow="Daily score">
        <View style={{ gap: space.base, paddingBottom: space.base }}>
          <Body tone="muted">
            Tasks, habits and focus are weighted 50 / 30 / 20. Anything you had nothing scheduled
            for is removed and its weight is shared out, so an empty category never drags the score
            down.
          </Body>

          <View style={{ gap: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }}>
            {score.components.map((component) => (
              <View
                key={component.key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space.md,
                  padding: space.md,
                  backgroundColor: c.surface2,
                  opacity: component.applicable ? 1 : 0.45,
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Title>{component.label}</Title>
                  <Caption tone="faint">
                    {component.applicable ? component.detail : 'Nothing scheduled — weight shared out'}
                  </Caption>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <MetricSmall tone="strong">
                    {component.applicable ? Math.round(component.points) : '—'}
                  </MetricSmall>
                  <Caption tone="faint">
                    of {component.applicable ? Math.round(component.weight) : 0}
                  </Caption>
                </View>
              </View>
            ))}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: space.md,
                backgroundColor: c.surface3,
              }}>
              <Title tone="strong" style={{ flex: 1 }}>
                Total
              </Title>
              <MetricSmall color={accent.base}>{score.score} / 100</MetricSmall>
            </View>
          </View>

          <Caption tone="faint">
            A day counts toward your streak at {threshold}% or above. You can change that threshold
            in Settings.
          </Caption>
        </View>
      </BottomSheet>
    </>
  );
}
