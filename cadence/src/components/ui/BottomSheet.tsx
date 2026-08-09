import React, { useCallback, useEffect } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { overlayShadow } from '@/theme/tokens';
import { IconButton } from './Button';
import { Display, Eyebrow } from './Text';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  /** Fraction of screen height the sheet may occupy. */
  maxHeightRatio?: number;
  scrollable?: boolean;
  footer?: React.ReactNode;
}

/**
 * Bottom sheet with a dimmed scrim, drag-to-dismiss and Android back-button
 * support. Panels are independently scrollable and capped so long content never
 * pushes the handle off-screen.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  eyebrow,
  children,
  maxHeightRatio = 0.88,
  scrollable = true,
  footer,
}: Props) {
  const { c, space, radius, motion } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const translateY = useSharedValue(height);
  const scrimOpacity = useSharedValue(0);

  const close = useCallback(() => {
    translateY.value = withTiming(height, { duration: motion.overlay });
    scrimOpacity.value = withTiming(0, { duration: motion.overlay }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  }, [height, motion.overlay, onClose, scrimOpacity, translateY]);

  useEffect(() => {
    if (visible) {
      translateY.value = height;
      scrimOpacity.value = 0;
      translateY.value = withTiming(0, {
        duration: motion.sheet,
        easing: Easing.out(Easing.cubic),
      });
      scrimOpacity.value = withTiming(1, { duration: motion.overlay });
    }
  }, [visible, height, motion, translateY, scrimOpacity]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) {
        translateY.value = withTiming(height, { duration: 200 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
        scrimOpacity.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withTiming(0, { duration: 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimOpacity.value }));

  const Body = scrollable ? ScrollView : View;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]}>
          <Pressable
            accessibilityLabel="Close"
            accessibilityRole="button"
            style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
            onPress={close}
          />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              {
                maxHeight: height * maxHeightRatio,
                backgroundColor: c.surface1,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                borderTopWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.lineStrong,
                paddingBottom: insets.bottom + space.base,
                ...overlayShadow,
              },
              sheetStyle,
            ]}>
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: space.md, alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 3,
                    borderRadius: 2,
                    backgroundColor: c.lineHover,
                  }}
                />
              </View>
            </GestureDetector>

            {(title || eyebrow) && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: space.base,
                  paddingTop: space.base,
                  paddingBottom: space.md,
                  gap: space.md,
                }}>
                <View style={{ flex: 1, gap: 2 }}>
                  {eyebrow ? <Eyebrow tone="faint">{eyebrow}</Eyebrow> : null}
                  {title ? <Display tone="strong">{title}</Display> : null}
                </View>
                <IconButton icon="x" label="Close" onPress={close} size={38} bordered={false} />
              </View>
            )}

            <Body
              style={scrollable ? { flexShrink: 1 } : undefined}
              contentContainerStyle={
                scrollable
                  ? { paddingHorizontal: space.base, paddingBottom: space.base }
                  : undefined
              }
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {scrollable ? children : <View style={{ paddingHorizontal: space.base }}>{children}</View>}
            </Body>

            {footer ? (
              <View
                style={{
                  paddingHorizontal: space.base,
                  paddingTop: space.md,
                  borderTopWidth: StyleSheet.hairlineWidth * 2,
                  borderTopColor: c.line,
                }}>
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
