import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip, ChipGroup, InlineNote, TextField } from '@/components/ui/Controls';
import { useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll } from '@/components/ui/Layout';
import { DateField, DurationField } from '@/components/ui/Pickers';
import { Caption, Eyebrow } from '@/components/ui/Text';
import { toFriendlyError } from '@/services/firebase/errors';
import { createChapters, createCourse, createSubject, fetchCourses } from '@/services/studyService';
import { useAuthStore, useSettings } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';
import { CATEGORY_COLORS } from '@/theme/tokens';
import type { Course } from '@/types/models';

export default function NewSubject() {
  const { c, space } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const subjects = useDataStore((s) => s.subjects);
  const refreshChapters = useDataStore((s) => s.refreshChapters);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_COLORS[subjects.length % CATEGORY_COLORS.length]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [newCourse, setNewCourse] = useState('');
  const [examDate, setExamDate] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [weeklyTarget, setWeeklyTarget] = useState<number | null>(null);
  const [chaptersText, setChaptersText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    fetchCourses(uid)
      .then((list) => {
        setCourses(list);
        if (list.length === 1) setCourseId(list[0].id);
      })
      .catch(() => {});
  }, [uid]);

  const save = async () => {
    if (!uid) return;
    if (!name.trim()) {
      toast.show('Give the subject a name.', 'error');
      return;
    }
    setSaving(true);
    try {
      let resolvedCourse = courseId;
      if (!resolvedCourse && newCourse.trim()) {
        const created = await createCourse(uid, newCourse.trim());
        resolvedCourse = created.id;
      }

      const subject = await createSubject(uid, {
        name,
        code: code.trim() || null,
        courseId: resolvedCourse,
        color,
        examDate,
        targetDate,
        weeklyTargetMinutes: weeklyTarget,
        order: subjects.length,
      });

      const chapterNames = chaptersText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (chapterNames.length > 0) await createChapters(uid, subject.id, chapterNames);

      await refreshChapters();
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
              placeholder="Engineering Mathematics"
              autoFocus
            />
            <TextField label="Code" value={code} onChangeText={setCode} placeholder="Optional" />

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

            <View style={{ gap: space.sm }}>
              <Eyebrow tone="meta">Course or semester</Eyebrow>
              {courses.length > 0 ? (
                <ChipGroup>
                  {courses.map((course) => (
                    <Chip
                      key={course.id}
                      label={course.name}
                      size="sm"
                      selected={courseId === course.id}
                      onPress={() => setCourseId(courseId === course.id ? null : course.id)}
                    />
                  ))}
                </ChipGroup>
              ) : null}
              <TextField
                value={newCourse}
                onChangeText={setNewCourse}
                placeholder={courses.length ? 'Or create a new one' : 'Semester 3'}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <DateField
                label="Exam"
                value={examDate}
                onChange={setExamDate}
                weekStart={settings.weekStart}
                clearLabel="No exam"
              />
              <DateField
                label="Finish by"
                value={targetDate}
                onChange={setTargetDate}
                weekStart={settings.weekStart}
                clearLabel="No target"
              />
            </View>

            <DurationField
              label="Weekly study target"
              value={weeklyTarget}
              onChange={setWeeklyTarget}
              presets={[120, 180, 240, 300, 360, 480]}
            />

            <TextField
              label="Chapters"
              value={chaptersText}
              onChangeText={setChaptersText}
              placeholder={'Matrices\nDifferential Equations\nProbability\nLaplace Transform'}
              multiline
              hint="One per line. You can add more later."
            />

            <InlineNote
              icon="info"
              text="Study time never marks a chapter complete on its own — you confirm progress when you finish a session."
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
