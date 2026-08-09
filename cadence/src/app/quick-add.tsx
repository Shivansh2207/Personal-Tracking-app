import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { Icon, IconName } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Body, Caption, Title } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { saveReflection } from '@/services/reviewService';
import { createTask } from '@/services/taskService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { todayKey } from '@/utils/date';

type Mode = 'menu' | 'task' | 'note';

const OPTIONS: { key: string; label: string; caption: string; icon: IconName; href?: string; mode?: Mode }[] = [
  { key: 'task', label: 'Task', caption: 'Something to get done', icon: 'check-square', mode: 'task' },
  { key: 'focus', label: 'Focus session', caption: 'Start a study or work timer', icon: 'play', href: '/focus/setup' },
  { key: 'habit', label: 'Habit', caption: 'Track a repeating behaviour', icon: 'repeat', href: '/habit/new' },
  { key: 'activity', label: 'Workout / activity', caption: 'Log gym, running, sports', icon: 'activity', href: '/activity/new' },
  { key: 'goal', label: 'Goal', caption: 'Something bigger to work toward', icon: 'target', href: '/goal/new' },
  { key: 'note', label: 'Note / reflection', caption: 'Capture a thought', icon: 'edit-3', mode: 'note' },
];

/**
 * Quick Add. Selecting "Task" drops the cursor straight into the name field so
 * a task can be captured in a couple of seconds; everything else is one tap to
 * the right screen.
 */
export default function QuickAdd() {
  const { c, space, accent, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();

  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const scheduleRecompute = useDataStore((s) => s.scheduleRecompute);

  const [mode, setMode] = useState<Mode>('menu');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => router.back();

  const saveTask = async () => {
    if (!uid || !title.trim()) return;
    setSaving(true);
    try {
      const today = todayKey();
      await createTask(uid, { title, scheduledDate: today, priority: 'medium' });
      scheduleRecompute(today);
      toast.show('Task added to today.', 'success');
      close();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the task').message, 'error');
      setSaving(false);
    }
  };

  const saveNote = async () => {
    if (!uid || !note.trim()) return;
    setSaving(true);
    try {
      await saveReflection(uid, todayKey(), note);
      toast.show('Note saved.', 'success');
      close();
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not save the note').message, 'error');
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible
      onClose={close}
      title={mode === 'task' ? 'New task' : mode === 'note' ? 'New note' : 'Quick add'}
      eyebrow="Capture"
      scrollable={mode === 'menu'}>
      {mode === 'menu' ? (
        <View style={{ paddingBottom: space.base, gap: StyleSheet.hairlineWidth * 2 }}>
          {OPTIONS.map((option) => (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityHint={option.caption}
              onPress={() => {
                if (option.mode) setMode(option.mode);
                else if (option.href) {
                  router.back();
                  setTimeout(() => router.push(option.href as never), 220);
                }
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.base,
                padding: space.base,
                backgroundColor: pressed ? c.surface3 : c.surface2,
                borderRadius: radius.card,
                borderWidth: StyleSheet.hairlineWidth * 2,
                borderColor: c.line,
              })}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.inset,
                }}>
                <Icon name={option.icon} size={17} color={accent.base} />
              </View>
              <View style={{ flex: 1 }}>
                <Title>{option.label}</Title>
                <Caption tone="faint">{option.caption}</Caption>
              </View>
              <Icon name="chevron-right" size={16} color={c.text30} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {mode === 'task' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: space.base, paddingBottom: space.base }}>
            <TextField
              value={title}
              onChangeText={setTitle}
              placeholder="Finish API integration"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveTask}
            />
            <Body tone="faint" style={{ fontSize: 13 }}>
              Saved to today. Open it afterwards to add a time, category or repeat.
            </Body>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Button
                label="More options"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => {
                  router.back();
                  setTimeout(() => router.push('/task/new'), 220);
                }}
              />
              <Button
                label="Add"
                style={{ flex: 1 }}
                loading={saving}
                disabled={!title.trim()}
                onPress={saveTask}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}

      {mode === 'note' ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ gap: space.base, paddingBottom: space.base }}>
            <TextField
              value={note}
              onChangeText={setNote}
              placeholder="What's on your mind?"
              autoFocus
              multiline
            />
            <Button
              label="Save note"
              full
              loading={saving}
              disabled={!note.trim()}
              onPress={saveNote}
            />
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </BottomSheet>
  );
}
