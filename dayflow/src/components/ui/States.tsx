import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { Body, Display, Eyebrow } from './Text';

interface EmptyStateProps {
  icon?: IconName;
  eyebrow?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'inbox',
  eyebrow,
  title,
  message,
  actionLabel,
  onAction,
  compact,
  style,
}: EmptyStateProps) {
  const { c, space, radius } = useTheme();
  return (
    <View
      style={[
        {
          alignItems: 'center',
          paddingVertical: compact ? space.xl : space.h2,
          paddingHorizontal: space.lg,
          gap: space.md,
        },
        style,
      ]}>
      <View
        style={{
          width: 56,
          height: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderStyle: 'dashed',
          borderColor: c.lineStrong,
        }}>
        <Icon name={icon} size={22} color={c.text30} />
      </View>
      {eyebrow ? <Eyebrow tone="faint">{eyebrow}</Eyebrow> : null}
      <Display tone="strong" align="center">
        {title}
      </Display>
      {message ? (
        <Body tone="muted" align="center" style={{ maxWidth: 300 }}>
          {message}
        </Body>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="sm" style={{ marginTop: space.xs }} />
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  style,
}: ErrorStateProps) {
  const { semantic, space, radius, c } = useTheme();
  return (
    <View
      style={[
        {
          alignItems: 'center',
          gap: space.md,
          padding: space.xl,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
          backgroundColor: c.surface2,
        },
        style,
      ]}>
      <Icon name="alert-triangle" size={24} color={semantic.danger} />
      <Display tone="strong" align="center">
        {title}
      </Display>
      <Body tone="muted" align="center">
        {message}
      </Body>
      {onRetry ? <Button label={retryLabel} variant="outline" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

/** Shimmering placeholder used while the first payload lands. */
export function Skeleton({
  height = 16,
  width,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
}) {
  const { c, radius } = useTheme();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { height, width: width ?? '100%', backgroundColor: c.surface3, borderRadius: radius.none },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  const { space, c, radius } = useTheme();
  return (
    <View
      style={{
        padding: space.base,
        gap: space.sm,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.line,
        borderRadius: radius.card,
        backgroundColor: c.surface2,
      }}>
      <Skeleton height={12} width="40%" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} height={14} width={i === lines - 1 ? '65%' : '100%'} />
      ))}
    </View>
  );
}

/** Persistent banner shown while Firestore reports the client is offline. */
export function OfflineBanner({ visible, message }: { visible: boolean; message?: string }) {
  const { semantic, space, c } = useTheme();
  if (!visible) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingVertical: space.sm,
        paddingHorizontal: space.base,
        backgroundColor: c.surface3,
        borderBottomWidth: StyleSheet.hairlineWidth * 2,
        borderBottomColor: c.line,
      }}>
      <Icon name="cloud-off" size={14} color={semantic.warning} />
      <Body tone="muted" style={{ flex: 1, fontSize: 13 }}>
        {message ?? 'Offline — changes are saved on this device and will sync.'}
      </Body>
    </View>
  );
}
