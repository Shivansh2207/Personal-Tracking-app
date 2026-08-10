import * as Haptics from 'expo-haptics';
import React, { useMemo } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import type { DateKey } from '@/types/models';
import {
  addMonths,
  fromDateKey,
  monthGrid,
  monthName,
  startOfMonth,
  todayKey,
  weekdayHeaders,
} from '@/utils/date';
import { IconButton } from './Button';
import { Caption, Display, Eyebrow } from './Text';

export interface DayDecoration {
  /** 0–100; drives the intensity band. */
  intensity?: number | null;
  /** Shows a small dot when the day has planned but unscored work. */
  planned?: boolean;
  restDay?: boolean;
}

interface Props {
  /** Any date inside the month being displayed. */
  month: DateKey;
  onMonthChange: (month: DateKey) => void;
  selected?: DateKey | null;
  onSelectDate: (date: DateKey) => void;
  decorations?: Record<DateKey, DayDecoration>;
  weekStart?: 0 | 1;
  minDate?: DateKey;
  maxDate?: DateKey;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

/** Four-step intensity ladder — no activity, low, medium, high, excellent. */
export function intensityLevel(intensity: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
  if (intensity === null || intensity === undefined) return 0;
  if (intensity <= 0) return 0;
  if (intensity < 40) return 1;
  if (intensity < 60) return 2;
  if (intensity < 85) return 3;
  return 4;
}

export function useIntensityColors() {
  const { accent, c } = useTheme();
  return useMemo(
    () => [
      c.inset,
      withAlpha(accent.base, 0.22),
      withAlpha(accent.base, 0.44),
      withAlpha(accent.base, 0.7),
      accent.base,
    ],
    [accent.base, c.inset],
  );
}

export function Calendar({
  month,
  onMonthChange,
  selected,
  onSelectDate,
  decorations = {},
  weekStart = 1,
  minDate,
  maxDate,
  style,
  compact,
}: Props) {
  const { c, space, accent, radius } = useTheme();
  const colors = useIntensityColors();
  const today = todayKey();
  const monthStart = startOfMonth(month);
  const monthDate = fromDateKey(monthStart);
  const cells = useMemo(() => monthGrid(monthStart, weekStart), [monthStart, weekStart]);
  const headers = useMemo(() => weekdayHeaders(weekStart), [weekStart]);
  const cellSize = compact ? 34 : 40;

  return (
    <View style={style}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: space.md,
        }}>
        <IconButton
          icon="chevron-left"
          label="Previous month"
          size={38}
          onPress={() => onMonthChange(addMonths(monthStart, -1))}
        />
        <View style={{ alignItems: 'center' }}>
          <Display tone="strong">{monthName(monthDate.getMonth())}</Display>
          <Eyebrow tone="faint">{monthDate.getFullYear()}</Eyebrow>
        </View>
        <IconButton
          icon="chevron-right"
          label="Next month"
          size={38}
          onPress={() => onMonthChange(addMonths(monthStart, 1))}
        />
      </View>

      <View style={{ flexDirection: 'row', paddingBottom: space.sm }}>
        {headers.map((h, i) => (
          <View key={`${h}-${i}`} style={{ flex: 1, alignItems: 'center' }}>
            <Eyebrow tone="faint">{h}</Eyebrow>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === monthStart.slice(0, 7);
          const isToday = date === today;
          const isSelected = selected === date;
          const decoration = decorations[date];
          const level = intensityLevel(decoration?.intensity);
          const disabled = (minDate && date < minDate) || (maxDate && date > maxDate);
          const dayNumber = Number(date.slice(8));

          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${date}${decoration?.intensity ? `, ${Math.round(decoration.intensity)} percent` : ''}`}
              accessibilityState={{ selected: isSelected, disabled: !!disabled }}
              disabled={!!disabled}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelectDate(date);
              }}
              style={{
                width: `${100 / 7}%`,
                alignItems: 'center',
                paddingVertical: 3,
                opacity: disabled ? 0.25 : inMonth ? 1 : 0.3,
              }}>
              <View
                style={{
                  width: cellSize,
                  height: cellSize,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.card,
                  backgroundColor: level > 0 ? colors[level] : 'transparent',
                  borderWidth: isSelected || isToday ? StyleSheet.hairlineWidth * 3 : 0,
                  borderColor: isSelected ? accent.base : c.lineHover,
                }}>
                <Caption
                  color={
                    level >= 3 ? accent.on : isSelected ? accent.base : inMonth ? c.text80 : c.text40
                  }>
                  {dayNumber}
                </Caption>
                {decoration?.planned && level === 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 5,
                      width: 3,
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: accent.base,
                    }}
                  />
                ) : null}
                {decoration?.restDay ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 4,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: c.text40,
                    }}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Legend explaining the intensity ladder — colour is never the only cue. */
export function IntensityLegend({ style }: { style?: StyleProp<ViewStyle> }) {
  const { space } = useTheme();
  const colors = useIntensityColors();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.xs }, style]}>
      <Eyebrow tone="faint">Less</Eyebrow>
      {colors.map((color, i) => (
        <View key={i} style={{ width: 12, height: 12, backgroundColor: color }} />
      ))}
      <Eyebrow tone="faint">More</Eyebrow>
    </View>
  );
}
