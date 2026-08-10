import React from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

type Level = 1 | 2 | 3;

interface CardProps extends ViewProps {
  level?: Level;
  /** Removes the hairline border — used inside seamed grids. */
  seamless?: boolean;
  padded?: boolean;
  accentBorder?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The base surface. Separation comes from tone plus a 1px hairline, not from
 * drop shadows — that is what keeps the interface reading as an instrument
 * panel rather than a stack of floating cards.
 */
export function Card({
  level = 2,
  seamless,
  padded = true,
  accentBorder,
  style,
  children,
  ...rest
}: CardProps) {
  const { c, radius, space, accentLine } = useTheme();
  const background = level === 1 ? c.surface1 : level === 2 ? c.surface2 : c.surface3;
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: background,
          borderRadius: radius.card,
          borderWidth: seamless ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: accentBorder ? accentLine : c.line,
          padding: padded ? space.base : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

interface PressableCardProps extends PressableProps {
  level?: Level;
  padded?: boolean;
  accentBorder?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PressableCard({
  level = 2,
  padded = true,
  accentBorder,
  style,
  children,
  ...rest
}: PressableCardProps) {
  const { c, radius, space, accentLine } = useTheme();
  const background = level === 1 ? c.surface1 : level === 2 ? c.surface2 : c.surface3;
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        {
          backgroundColor: pressed ? c.surface3 : background,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: accentBorder ? accentLine : pressed ? c.lineStrong : c.line,
          padding: padded ? space.base : 0,
        },
        typeof style === 'function' ? undefined : style,
      ]}>
      {children as React.ReactNode}
    </Pressable>
  );
}

/** A full-bleed hairline used to separate stacked rows. */
export function Divider({ style, inset = 0 }: { style?: StyleProp<ViewStyle>; inset?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={[
        {
          height: StyleSheet.hairlineWidth * 2,
          backgroundColor: c.line,
          marginLeft: inset,
        },
        style,
      ]}
    />
  );
}

/** Vertical rhythm helper. */
export function Spacer({ size = 16 }: { size?: number }) {
  return <View style={{ height: size }} />;
}

/**
 * Grid with 1px seams: the parent paints the line colour and children sit on
 * top with a 1px gap, producing continuous rules instead of floating cards.
 */
export function SeamGrid({
  columns = 2,
  children,
  style,
}: {
  columns?: number;
  children: React.ReactNode;
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
          overflow: 'hidden',
          gap: StyleSheet.hairlineWidth * 2,
        },
        style,
      ]}>
      {items.map((child, index) => (
        <View
          key={index}
          style={{
            width: `${100 / columns}%`,
            flexGrow: 1,
            flexBasis: `${100 / columns - 1}%`,
            backgroundColor: c.surface2,
          }}>
          {child}
        </View>
      ))}
    </View>
  );
}
