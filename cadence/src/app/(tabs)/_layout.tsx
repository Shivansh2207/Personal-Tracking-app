import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import Tabs, { type BottomTabBarProps } from 'expo-router/js-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '@/components/ui/Icon';
import { Eyebrow } from '@/components/ui/Text';
import { useTheme, withAlpha } from '@/theme/ThemeProvider';
import { TOUCH_MIN } from '@/theme/tokens';

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  plan: { label: 'Plan', icon: 'calendar' },
  track: { label: 'Track', icon: 'target' },
  analytics: { label: 'Analytics', icon: 'bar-chart-2' },
  profile: { label: 'Profile', icon: 'user' },
};

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <Tabs
      tabBar={(props) => <CadenceTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan' }} />
      <Tabs.Screen name="track" options={{ title: 'Track' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}

/**
 * Custom bar: hairline-separated, with the Quick Add action promoted into the
 * middle so a task is always two taps away.
 */
function CadenceTabBar({ state, navigation }: BottomTabBarProps) {
  const { c, accent, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const routes = state.routes.filter((r) => TAB_META[r.name]);
  const left = routes.slice(0, 2);
  const right = routes.slice(2);

  const renderTab = (route: (typeof routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const meta = TAB_META[route.name];

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        }}
        style={{
          flex: 1,
          minHeight: TOUCH_MIN + 6,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          paddingTop: 6,
        }}>
        <Icon name={meta.icon} size={18} color={focused ? accent.base : c.text40} />
        <Eyebrow color={focused ? accent.base : c.text40} style={{ fontSize: 9, letterSpacing: 1 }}>
          {meta.label}
        </Eyebrow>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: c.surface1,
        borderTopWidth: StyleSheet.hairlineWidth * 2,
        borderTopColor: c.line,
        paddingBottom: insets.bottom > 0 ? insets.bottom : space.sm,
      }}>
      {left.map(renderTab)}

      <View style={{ width: 76, alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quick add"
          accessibilityHint="Add a task, habit, focus session, activity, goal or note"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/quick-add');
          }}
          style={({ pressed }) => ({
            width: 52,
            height: 52,
            marginTop: -18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? accent.soft : accent.base,
            borderWidth: 3,
            borderColor: c.bg,
            shadowColor: accent.base,
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          })}>
          <Icon name="plus" size={24} color={accent.on} />
        </Pressable>
        <View
          style={{
            position: 'absolute',
            bottom: 8,
            width: 24,
            height: 2,
            backgroundColor: withAlpha(accent.base, 0.4),
          }}
        />
      </View>

      {right.map(renderTab)}
    </View>
  );
}
