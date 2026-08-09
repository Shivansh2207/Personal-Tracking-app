import { useRouter } from 'expo-router';
import React from 'react';
import {
  Platform,
  ScrollView,
  ScrollViewProps,
  StatusBar,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { IconButton } from './Button';
import { Icon, IconName } from './Icon';
import { Display, DisplaySmall, Eyebrow } from './Text';

export const GUTTER = 16;

interface ScreenProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Applies the safe-area top inset. Disable when a header handles it. */
  edges?: { top?: boolean; bottom?: boolean };
  level?: 0 | 1;
}

export function Screen({ children, style, edges, level = 0 }: ScreenProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: level === 0 ? c.bg : c.surface1,
          paddingTop: edges?.top === false ? 0 : insets.top,
          paddingBottom: edges?.bottom ? insets.bottom : 0,
        },
        style,
      ]}>
      <StatusBar barStyle={useTheme().isDark ? 'light-content' : 'dark-content'} />
      {children}
    </View>
  );
}

interface BodyScrollProps extends ScrollViewProps {
  children: React.ReactNode;
  /** Extra bottom padding so content clears the tab bar / FAB. */
  bottomInset?: number;
  gutter?: number;
}

export function ScreenScroll({
  children,
  bottomInset = 120,
  gutter = GUTTER,
  contentContainerStyle,
  ...rest
}: BodyScrollProps) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      {...rest}
      contentContainerStyle={[
        { paddingHorizontal: gutter, paddingBottom: bottomInset },
        contentContainerStyle,
      ]}>
      {children}
    </ScrollView>
  );
}

interface HeaderProps {
  title?: string;
  eyebrow?: string;
  onBack?: () => void;
  showBack?: boolean;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  large?: boolean;
  bordered?: boolean;
}

export function AppHeader({
  title,
  eyebrow,
  onBack,
  showBack,
  right,
  style,
  large,
  bordered = true,
}: HeaderProps) {
  const { c, space } = useTheme();
  const router = useRouter();
  const handleBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.md,
          paddingHorizontal: GUTTER,
          paddingVertical: space.md,
          borderBottomWidth: bordered ? StyleSheet.hairlineWidth * 2 : 0,
          borderBottomColor: c.line,
        },
        style,
      ]}>
      {showBack ? (
        <IconButton icon="chevron-left" label="Go back" onPress={handleBack} size={40} />
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        {eyebrow ? <Eyebrow tone="faint">{eyebrow}</Eyebrow> : null}
        {title ? (
          large ? (
            <Display tone="strong">{title}</Display>
          ) : (
            <DisplaySmall tone="strong">{title}</DisplaySmall>
          )
        ) : null}
      </View>
      {right}
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  meta?: string;
  style?: StyleProp<ViewStyle>;
  /** `01`, `02` … numbering used by the source visual system. */
  index?: number;
}

export function SectionHeader({ title, action, meta, style, index }: SectionHeaderProps) {
  const { space, accent } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingBottom: space.md,
        },
        style,
      ]}>
      {index !== undefined ? (
        <Eyebrow color={accent.base}>{String(index).padStart(2, '0')}</Eyebrow>
      ) : null}
      <Eyebrow tone="meta" style={{ flex: 1 }}>
        {title}
      </Eyebrow>
      {meta ? <Eyebrow tone="faint">{meta}</Eyebrow> : null}
      {action ? (
        <View
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onTouchEnd={action.onPress}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: space.sm }}>
          <Eyebrow color={accent.base}>{action.label}</Eyebrow>
          {action.icon ? <Icon name={action.icon} size={12} color={accent.base} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Full-width band separated by rules — the section rhythm of the theme. */
export function Band({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const { c, space } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface1,
          borderTopWidth: StyleSheet.hairlineWidth * 2,
          borderBottomWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.line,
          paddingVertical: padded ? space.lg : 0,
          paddingHorizontal: padded ? GUTTER : 0,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function KeyboardPad() {
  return <View style={{ height: Platform.OS === 'ios' ? 24 : 12 }} />;
}
