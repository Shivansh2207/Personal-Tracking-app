import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { resolveIcon } from '@/components/ui/Icon';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { createSubject, createTopic } from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_COLORS } from '@/theme/tokens';

export default function NewSubject() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const categories = useDataStore((s) => s.categories);
  const subjects = useDataStore((s) => s.subjects);

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [categoryId, setCategoryId] = useState<string | null>(
    categories.find((cat) => cat.kind === 'study')?.id ?? null,
  );
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [examDate, setExamDate] = useState<string | null>(null);
  const [topicsText, setTopicsText] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!uid) return;
    if (!name.trim()) {
      toast.show('Give the subject a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      const subject = await createSubject(uid, {
        name,
        color,
        categoryId,
        targetDate,
        examDate,
        order: subjects.length,
      });

      const topicNames = topicsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      for (let i = 0; i < topicNames.length; i += 1) {
        await createTopic(uid, subject.id, { name: topicNames[i], order: i });
      }

      toast.show('Subject created.', 'success');
      router.replace(`/subject/${subject.id}`);
    } catch (error) {
      toast.show(toFriendlyError(error, 'Could not create the subject').message, 'error');
      setSaving(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="New subject" eyebrow="Study" showBack />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenScroll bottomInset={40}>
          <View style={{ gap: space.lg, paddingTop: space.sm }}>
            <TextField
              label="Subject"
              value={name}
              onChangeText={setName}
              placeholder="Quantitative Methods"
              autoFocus
            />

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Colour</Eyebrow>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {CATEGORY_COLORS.map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`Colour ${option}`}
                    accessibilityState={{ selected: color === option }}
                    onPress={() => setColor(option)}
                    style={{
                      width: 38,
                      height: 38,
                      backgroundColor: option,
                      borderWidth: color === option ? 3 : 0,
                      borderColor: c.textStrong,
                    }}
                  />
                ))}
              </View>
            </View>

            {categories.filter((cat) => cat.active).length > 0 ? (
              <View style={{ gap: space.sm }}>
                <Eyebrow tone="meta">Category</Eyebrow>
                <ChipGroup>
                  {categories
                    .filter((cat) => cat.active)
                    .map((cat) => (
                      <Chip
                        key={cat.id}
                        label={cat.name}
                        color={cat.color}
                        icon={resolveIcon(cat.icon)}
                        selected={categoryId === cat.id}
                        onPress={() => setCategoryId(categoryId === cat.id ? null : cat.id)}
                      />
                    ))}
                </ChipGroup>
                <Caption tone="faint">
                  Study time is attributed to this category in your analytics.
                </Caption>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <DateField
                label="Target"
                value={targetDate}
                onChange={setTargetDate}
                weekStart={settings.weekStart}
                clearLabel="No target"
              />
              <DateField
                label="Exam"
                value={examDate}
                onChange={setExamDate}
                weekStart={settings.weekStart}
                clearLabel="No exam"
              />
            </View>

            <TextField
              label="Topics"
              value={topicsText}
              onChangeText={setTopicsText}
              placeholder={'Probability\nHypothesis Testing\nRegression'}
              multiline
              hint="One per line — you can add more later."
            />

            <InlineNote
              icon="zap"
              text="Every focus session you run against a topic adds to its study time and the subject's progress automatically."
            />
          </View>
        </ScreenScroll>
        <View
          style={{
            padding: 16,
            borderTopWidth: StyleSheet.hairlineWidth * 2,
            borderTopColor: c.line,
          }}>
          <Button label="Create subject" full size="lg" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
