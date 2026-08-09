import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  Oswald_500Medium,
  Oswald_600SemiBold,
  Oswald_700Bold,
} from '@expo-google-fonts/oswald';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from '@/components/ui/Feedback';
import { configureNotificationHandler } from '@/services/notificationService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTimerStore } from '@/store/timerStore';
import { AppThemeProvider, useTheme } from '@/theme/ThemeProvider';

SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotificationHandler();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
  });

  const initAuth = useAuthStore((s) => s.init);
  const restoreTimer = useTimerStore((s) => s.restore);

  useEffect(() => {
    const unsubscribe = initAuth();
    restoreTimer();
    return unsubscribe;
  }, [initAuth, restoreTimer]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const { c, isDark } = useTheme();
  const phase = useAuthStore((s) => s.phase);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const settings = useAuthStore((s) => s.profile?.settings ?? null);
  const initData = useDataStore((s) => s.init);
  const teardownData = useDataStore((s) => s.teardown);

  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.bg).catch(() => {});
  }, [c.bg]);

  // Bring the live data layer up once we know who the user is.
  useEffect(() => {
    if (phase === 'ready' && uid && settings) initData(uid, settings);
    if (phase === 'signed_out') teardownData();
  }, [phase, uid, settings, initData, teardownData]);

  useEffect(() => {
    if (phase === 'loading') return;
    SplashScreen.hideAsync().catch(() => {});

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (phase === 'signed_out' && !inAuth) {
      router.replace('/(auth)/welcome');
    } else if (phase === 'onboarding' && !inOnboarding) {
      router.replace('/(onboarding)');
    } else if (phase === 'ready' && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [phase, segments, router]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          animation: 'slide_from_right',
          navigationBarColor: c.bg,
          statusBarStyle: isDark ? 'light' : 'dark',
        }}>
        <Stack.Screen name="index" options={{ animation: 'fade' }} />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(onboarding)" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="focus/setup" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="focus/run" options={{ animation: 'fade' }} />
        <Stack.Screen name="quick-add" options={{ presentation: 'transparentModal', animation: 'fade' }} />
      </Stack>
    </View>
  );
}
