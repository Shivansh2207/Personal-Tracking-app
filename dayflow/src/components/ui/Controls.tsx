import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';
import { Icon, IconName } from './Icon';
import { Body, ButtonLabel, Caption, Eyebrow, Label, Title } from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  color?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
  size = 'md',
  disabled,
  style,
}: ChipProps) {
  const { c, accent, radius, space } = useTheme();
  const tint = color ?? accent.base;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xs + 2,
          minHeight: size === 'sm' ? 34 : 40,
          paddingHorizontal: size === 'sm' ? space.md : space.base,
          borderRadius: radius.pill,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: selected ? withAlpha(tint, 0.55) : pressed ? c.lineStrong : c.line,
          backgroundColor: selected ? withAlpha(tint, 0.14) : pressed ? c.surface3 : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={13} color={selected ? tint : c.text50} /> : null}
      <Caption color={selected ? tint : c.text60} style={{ letterSpacing: 0.2 }}>
        {label}
      </Caption>
    </Pressable>
  );
}

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}

/** Rectangular segmented control with hairline seams. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  style,
  scrollable,
}: SegmentedProps<T>) {
  const { c, accent, radius, accentWash } = useTheme();

  const content = options.map((option) => {
    const selected = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={option.label}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onChange(option.value);
        }}
        style={{
          flex: scrollable ? undefined : 1,
          minHeight: 38,
          paddingHorizontal: scrollable ? 18 : 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? accentWash : 'transparent',
          borderRadius: radius.control - 2,
        }}>
        <ButtonLabel color={selected ? accent.base : c.text50} numberOfLines={1}>
          {option.label}
        </ButtonLabel>
      </Pressable>
    );
  });

  const wrapper: StyleProp<ViewStyle> = [
    {
      flexDirection: 'row',
      padding: 3,
      gap: 3,
      backgroundColor: c.surface2,
      borderRadius: radius.control,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: c.line,
    },
    style,
  ];

  if (scrollable) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}>
        <View style={wrapper}>{content}</View>
      </ScrollView>
    );
  }
  return <View style={wrapper}>{content}</View>;
}

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IconName;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export function TextField({
  label,
  hint,
  error,
  icon,
  right,
  containerStyle,
  style,
  multiline,
  ...rest
}: FieldProps) {
  const { c, accent, radius, space, semantic, type } = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={[{ gap: space.sm }, containerStyle]}>
      {label ? <Eyebrow tone="meta">{label}</Eyebrow> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: space.sm,
          minHeight: multiline ? 96 : TOUCH_MIN + 4,
          paddingHorizontal: space.md,
          paddingVertical: multiline ? space.md : 0,
          backgroundColor: c.surface2,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: error ? semantic.danger : focused ? accent.base : c.line,
        }}>
        {icon ? (
          <Icon name={icon} size={16} color={focused ? accent.base : c.text40} style={{ marginTop: multiline ? 3 : 0 }} />
        ) : null}
        <TextInput
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={c.text30}
          selectionColor={accent.base}
          style={[
            type.body,
            {
              flex: 1,
              color: c.text,
              paddingVertical: multiline ? 0 : 12,
              textAlignVertical: multiline ? 'top' : 'center',
              minHeight: multiline ? 72 : undefined,
            },
            style,
          ]}
        />
        {right}
      </View>
      {error ? (
        <Caption color={semantic.danger} accessibilityLiveRegion="polite">
          {error}
        </Caption>
      ) : hint ? (
        <Caption tone="faint">{hint}</Caption>
      ) : null}
    </View>
  );
}

interface RowProps {
  label: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  subtitle?: string;
}

/** Settings-style row. */
export function ListRow({
  label,
  value,
  icon,
  onPress,
  right,
  destructive,
  disabled,
  subtitle,
}: RowProps) {
  const { c, space, semantic } = useTheme();
  const content = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: TOUCH_MIN + 8,
        paddingVertical: space.md,
      }}>
      {icon ? (
        <Icon name={icon} size={17} color={destructive ? semantic.danger : c.text50} />
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Title color={destructive ? semantic.danger : c.text}>{label}</Title>
        {subtitle ? <Caption tone="faint">{subtitle}</Caption> : null}
      </View>
      {value ? <Label tone="meta">{value}</Label> : null}
      {right ?? (onPress ? <Icon name="chevron-right" size={16} color={c.text30} /> : null)}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : disabled ? 0.4 : 1 })}>
      {content}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  subtitle,
  value,
  onChange,
  icon,
  disabled,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  icon?: IconName;
  disabled?: boolean;
}) {
  const { accent, c } = useTheme();
  return (
    <ListRow
      label={label}
      subtitle={subtitle}
      icon={icon}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ false: c.inset, true: withAlpha(accent.base, 0.5) }}
          thumbColor={value ? accent.base : c.text40}
          ios_backgroundColor={c.inset}
          accessibilityLabel={label}
        />
      }
    />
  );
}

/** Horizontal row of selectable options, wrapping onto multiple lines. */
export function ChipGroup({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { space } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, style]}>
      {children}
    </View>
  );
}

/** 1–5 rating selector used by session and review flows. */
export function RatingPicker({
  value,
  onChange,
  max = 5,
  labels,
}: {
  value: number | null;
  onChange: (value: number) => void;
  max?: number;
  labels?: string[];
}) {
  const { c, accent, radius, space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const active = value !== null && n <= value;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={labels?.[i] ?? `${n} of ${max}`}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(n);
            }}
            style={{
              flex: 1,
              minHeight: TOUCH_MIN,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              borderWidth: StyleSheet.hairlineWidth * 2,
              borderColor: active ? withAlpha(accent.base, 0.55) : c.line,
              backgroundColor: active ? withAlpha(accent.base, 0.14) : 'transparent',
            }}>
            <Body color={active ? accent.base : c.text50}>{n}</Body>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InlineNote({ text, icon = 'info' }: { text: string; icon?: IconName }) {
  const { c, space, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.sm,
        padding: space.md,
        backgroundColor: c.surface2,
        borderRadius: radius.card,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: c.line,
      }}>
      <Icon name={icon} size={14} color={c.text40} style={{ marginTop: 2 }} />
      <Body tone="muted" style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>
        {text}
      </Body>
    </View>
  );
}
