import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { Icon, IconName } from './Icon';
import { Caption, Eyebrow, Metric, MetricLarge } from './Text';

interface Props {
  label: string;
  value: string;
  caption?: string;
  delta?: number | null;
  deltaSuffix?: string;
  icon?: IconName;
  large?: boolean;
  onPress?: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Inverts the meaning of a positive delta (e.g. time overruns). */
  lowerIsBetter?: boolean;
}

export function MetricCard({
  label,
  value,
  caption,
  delta,
  deltaSuffix = '%',
  icon,
  large,
  onPress,
  color,
  style,
  lowerIsBetter,
}: Props) {
  const { c, space } = useTheme();
  const Value = large ? MetricLarge : Metric;

  const content = (
    <View style={{ padding: space.base, gap: space.xs, minHeight: large ? 118 : 96 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={12} color={c.text40} /> : null}
        <Eyebrow tone="faint" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Eyebrow>
      </View>
      <Value tone="strong" color={color} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Value>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        {delta !== null && delta !== undefined ? (
          <StatChangeIndicator value={delta} suffix={deltaSuffix} lowerIsBetter={lowerIsBetter} />
        ) : null}
        {caption ? (
          <Caption tone="faint" numberOfLines={1} style={{ flex: 1 }}>
            {caption}
          </Caption>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [{ backgroundColor: pressed ? c.surface3 : undefined }, style]}>
      {content}
    </Pressable>
  );
}

export function StatChangeIndicator({
  value,
  suffix = '%',
  lowerIsBetter,
}: {
  value: number;
  suffix?: string;
  lowerIsBetter?: boolean;
}) {
  const { semantic, c } = useTheme();
  const rounded = Math.round(value);
  if (rounded === 0) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Icon name="minus" size={11} color={c.text40} />
        <Caption tone="faint">No change</Caption>
      </View>
    );
  }
  const positive = rounded > 0;
  const good = lowerIsBetter ? !positive : positive;
  const tint = good ? semantic.success : semantic.danger;
  return (
    <View
      accessibilityLabel={`${positive ? 'Up' : 'Down'} ${Math.abs(rounded)}${suffix}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name={positive ? 'arrow-up-right' : 'arrow-down-right'} size={11} color={tint} />
      <Caption color={tint}>
        {Math.abs(rounded)}
        {suffix}
      </Caption>
    </View>
  );
}

/** A 2-up (or n-up) grid of metric cards joined by hairline seams. */
export function MetricGrid({
  children,
  columns = 2,
  style,
}: {
  children: React.ReactNode;
  columns?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, radius } = useTheme();
  const items = React.Children.toArray(children);
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          flexWrap: 'wrap',
          backgroundColor: c.line,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
          overflow: 'hidden',
          gap: StyleSheet.hairlineWidth * 2,
        },
        style,
      ]}>
      {items.map((child, index) => (
        <View
          key={index}
          style={{
            width: `${100 / columns - 0.5}%`,
            flexGrow: 1,
            backgroundColor: c.surface2,
          }}>
          {child}
        </View>
      ))}
    </View>
  );
}
