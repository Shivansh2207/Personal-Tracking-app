import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { overlayShadow } from '@/theme/tokens';
import { Button } from './Button';
import { Icon, IconName } from './Icon';
import { Body, Display } from './Text';

interface ConfirmProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Extra choices rendered above the confirm/cancel pair. */
  options?: { label: string; onPress: () => void; icon?: IconName }[];
  loading?: boolean;
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
  options,
  loading,
}: ConfirmProps) {
  const { c, space, radius } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        accessibilityLabel="Dismiss"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center', padding: space.xl },
        ]}
        onPress={onCancel}>
        <Pressable
          accessibilityViewIsModal
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            backgroundColor: c.surface1,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.lineStrong,
            padding: space.xl,
            gap: space.md,
            ...overlayShadow,
          }}>
          <Display tone="strong">{title}</Display>
          {message ? <Body tone="muted">{message}</Body> : null}
          {options?.length ? (
            <View style={{ gap: space.sm, paddingTop: space.xs }}>
              {options.map((option) => (
                <Button
                  key={option.label}
                  label={option.label}
                  icon={option.icon}
                  variant="outline"
                  full
                  onPress={option.onPress}
                />
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: space.md, paddingTop: space.sm }}>
            <Button label={cancelLabel} variant="ghost" onPress={onCancel} style={{ flex: 1 }} />
            <Button
              label={confirmLabel}
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              loading={loading}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export type ToastTone = 'default' | 'success' | 'error';

interface ToastValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastValue>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  const show = useCallback((message: string, tone: ToastTone = 'default') => {
    setToast({ message, tone });
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <Toast toast={toast} onHide={() => setToast(null)} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

function Toast({
  toast,
  onHide,
}: {
  toast: { message: string; tone: ToastTone } | null;
  onHide: () => void;
}) {
  const { c, space, radius, semantic } = useTheme();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!toast) return;
    progress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(() => {
      progress.value = withTiming(0, { duration: 200 });
      setTimeout(onHide, 220);
    }, 2600);
    return () => clearTimeout(timer);
  }, [toast, onHide, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));

  if (!toast) return null;

  const tint =
    toast.tone === 'success' ? semantic.success : toast.tone === 'error' ? semantic.danger : c.text60;
  const icon: IconName =
    toast.tone === 'success' ? 'check-circle' : toast.tone === 'error' ? 'alert-circle' : 'info';

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: 'absolute',
          left: space.base,
          right: space.base,
          bottom: insets.bottom + 96,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          paddingVertical: space.md,
          paddingHorizontal: space.base,
          backgroundColor: c.surface3,
          borderRadius: radius.control,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: c.lineStrong,
          ...overlayShadow,
        },
        style,
      ]}>
      <Icon name={icon} size={16} color={tint} />
      <Body style={{ flex: 1 }} numberOfLines={2}>
        {toast.message}
      </Body>
    </Animated.View>
  );
}
