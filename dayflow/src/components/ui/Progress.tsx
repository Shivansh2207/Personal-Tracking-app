import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

interface RingProps {
  /** 0–100. */
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
  accessibilityLabel?: string;
}

/**
 * Circular progress. The sweep animates on change, but the value is also
 * exposed through an accessibility label so progress is never conveyed by
 * colour and shape alone.
 */
export function ProgressRing({
  value,
  size = 132,
  thickness = 8,
  color,
  trackColor,
  children,
  style,
  animate = true,
  accessibilityLabel,
}: RingProps) {
  const { accent, c } = useTheme();
  const stroke = color ?? accent.base;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  const progress = useSharedValue(animate ? 0 : clamped);
  const [reduceMotion, setReduceMotion] = React.useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!animate || reduceMotion) {
      progress.value = clamped;
      return;
    }
    progress.value = withTiming(clamped, {
      duration: 620,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped, animate, reduceMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  return (
    <View
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${Math.round(clamped)} percent`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? c.inset}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={stroke}
          strokeWidth={thickness}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

interface BarProps {
  value: number;
  height?: number;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
  accessibilityLabel?: string;
}

export function ProgressBar({
  value,
  height = 6,
  color,
  trackColor,
  style,
  animate = true,
  accessibilityLabel,
}: BarProps) {
  const { accent, c, radius } = useTheme();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const [width, setWidth] = React.useState(0);
  const progress = useSharedValue(animate ? 0 : clamped);

  useEffect(() => {
    progress.value = animate
      ? withTiming(clamped, { duration: 480, easing: Easing.out(Easing.cubic) })
      : clamped;
  }, [clamped, animate, progress]);

  const animatedProps = useAnimatedProps(() => ({
    width: Math.max(0, (width * progress.value) / 100),
  }));

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${Math.round(clamped)} percent`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      style={[
        {
          height,
          backgroundColor: trackColor ?? c.inset,
          borderRadius: radius.none,
          overflow: 'hidden',
        },
        style,
      ]}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <AnimatedRect
            x={0}
            y={0}
            height={height}
            fill={color ?? accent.base}
            animatedProps={animatedProps}
          />
        </Svg>
      ) : null}
    </View>
  );
}

/** Ten-segment bar used in the habit grid — reads as a physical meter. */
export function SegmentBar({
  value,
  segments = 10,
  color,
  height = 8,
  gap = 2,
  style,
}: {
  value: number;
  segments?: number;
  color?: string;
  height?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { accent, c } = useTheme();
  const filled = Math.round((Math.max(0, Math.min(100, value)) / 100) * segments);
  const tint = color ?? accent.base;
  return (
    <View
      style={[{ flexDirection: 'row', gap }, style]}
      accessible
      accessibilityLabel={`${Math.round(value)} percent`}>
      {Array.from({ length: segments }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height,
            backgroundColor: i < filled ? tint : c.inset,
          }}
        />
      ))}
    </View>
  );
}
