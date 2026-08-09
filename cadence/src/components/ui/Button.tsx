import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import { Icon, IconName } from './Icon';
import { ButtonLabel } from './Text';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const HEIGHTS: Record<Size, number> = { sm: 40, md: 48, lg: 54 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  full,
  haptic = true,
  style,
  accessibilityHint,
}: Props) {
  const { c, accent, radius, space, semantic } = useTheme();
  const inactive = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case 'primary':
        return { bg: accent.base, border: accent.base, fg: accent.on };
      case 'danger':
        return { bg: 'transparent', border: semantic.danger, fg: semantic.danger };
      case 'outline':
        return { bg: 'transparent', border: c.lineStrong, fg: c.text };
      default:
        return { bg: 'transparent', border: 'transparent', fg: c.text60 };
    }
  })();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: Math.max(TOUCH_MIN, HEIGHTS[size]),
          paddingHorizontal: size === 'sm' ? space.base : space.xl,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: palette.border,
          backgroundColor: pressed && variant === 'primary' ? accent.soft : palette.bg,
          opacity: inactive ? 0.45 : 1,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          alignSelf: full ? 'stretch' : 'flex-start',
          ...(pressed && variant !== 'primary' ? { backgroundColor: c.surface3 } : null),
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={16} color={palette.fg} /> : null}
          <ButtonLabel color={palette.fg}>{label}</ButtonLabel>
          {iconRight ? <Icon name={iconRight} size={16} color={palette.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  label: string;
  size?: number;
  color?: string;
  bordered?: boolean;
  active?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  onPress,
  label,
  size = 44,
  color,
  bordered = true,
  active,
  disabled,
  style,
}: IconButtonProps) {
  const { c, accent, radius, accentWash, accentLine } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.control,
          borderWidth: bordered ? StyleSheet.hairlineWidth * 2 : 0,
          borderColor: active ? accentLine : c.line,
          backgroundColor: active ? accentWash : pressed ? c.surface3 : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      <Icon name={icon} size={Math.round(size * 0.42)} color={color ?? (active ? accent.base : c.text60)} />
    </Pressable>
  );
}

/** A row of actions separated by hairlines rather than gaps. */
export function ButtonRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { space } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', gap: space.md }, style]}>{children}</View>
  );
}

export async function successHaptic() {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export async function impactHaptic() {
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
