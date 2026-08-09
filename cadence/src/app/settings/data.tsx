import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { InlineNote, TextField } from '@/components/ui/Controls';
import { ConfirmationDialog, useToast } from '@/components/ui/Feedback';
import { AppHeader, Screen, ScreenScroll, SectionHeader } from '@/components/ui/Layout';
import { Body, Caption } from '@/components/ui/Text';
import { deleteAllUserData, exportUserData } from '@/services/exportService';
import { toFriendlyError } from '@/services/firebase/errors';
import { cancelAll } from '@/services/notificationService';
import { seedDemoData } from '@/services/seedService';
import { deleteAccount } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { useDataStore } from '@/store/dataStore';
import { useTheme } from '@/theme/ThemeProvider';

export default function DataSettings() {
  const { c, space, radius } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const teardown = useDataStore((s) => s.teardown);
  const settings = useAuthStore((s) => s.profile?.settings ?? null);

  const [exporting, setExporting] = useState<'json' | 'csv' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const loadSampleWeek = async () => {
    if (!uid || !settings) return;
    setSeeding(true);
    try {
      await seedDemoData(uid, { settings });
      setConfirmSample(false);
      toast.show('Sample week loaded. Your dashboard and analytics are ready to explore.', 'success');
    } catch (e) {
      toast.show(toFriendlyError(e, 'Could not load sample data').message, 'error');
    } finally {
      setSeeding(false);
    }
  };

  const doExport = async (format: 'json' | 'csv') => {
    if (!uid) return;
    setExporting(format);
    try {
      const result = await exportUserData(uid, format);
      toast.show(
        result.shared ? 'Export ready.' : `Saved as ${result.filename}.`,
        'success',
      );
    } catch (e) {
      toast.show(toFriendlyError(e, 'Export failed').message, 'error');
    } finally {
      setExporting(null);
    }
  };

  const doDeleteAccount = async () => {
    if (!uid) return;
    setDeleting(true);
    try {
      await cancelAll();
      await deleteAllUserData(uid);
      await deleteAccount(password || undefined);
      teardown();
      setConfirmDelete(false);
      toast.show('Account deleted.');
      router.replace('/(auth)/welcome');
    } catch (e) {
      const friendly = toFriendlyError(e, 'Could not delete the account');
      toast.show(
        friendly.code === 'auth/requires-recent-login'
          ? 'Enter your password to confirm, or sign in again first.'
          : friendly.message,
        'error',
      );
      setDeleting(false);
    }
  };

  return (
    <Screen>
      <AppHeader title="Data & backup" eyebrow="Settings" showBack />
      <ScreenScroll>
        <View style={{ gap: space.xl, paddingTop: space.sm }}>
          {__DEV__ ? (
            <View style={{ gap: space.md }}>
              <SectionHeader title="Demo workspace" />
              <Body tone="muted" style={{ fontSize: 13 }}>
                Load one realistic week of tasks, habits, study sessions, workouts and goals to
                explore every dashboard and analytics view.
              </Body>
              <Button
                label="Load sample week"
                icon="database"
                variant="outline"
                full
                loading={seeding}
                onPress={() => setConfirmSample(true)}
              />
              <Caption tone="faint">
                Development builds only. Demo records use stable IDs, so loading them again updates
                the same sample instead of creating duplicates.
              </Caption>
            </View>
          ) : null}

          <View style={{ gap: space.md }}>
            <SectionHeader title="Export" />
            <Body tone="muted" style={{ fontSize: 13 }}>
              Everything you have recorded — tasks, habits and their logs, subjects, topics, study
              sessions, activity, goals, daily scores and reviews.
            </Body>
            <Button
              label="Export as JSON"
              icon="download"
              variant="outline"
              full
              loading={exporting === 'json'}
              onPress={() => doExport('json')}
            />
            <Button
              label="Export as CSV"
              icon="download"
              variant="outline"
              full
              loading={exporting === 'csv'}
              onPress={() => doExport('csv')}
            />
            <Caption tone="faint">
              CSV is written as one labelled section per collection, which spreadsheets can split
              apart.
            </Caption>
          </View>

          <View style={{ gap: space.md }}>
            <SectionHeader title="Danger zone" />
            <InlineNote
              icon="alert-triangle"
              text="Deleting your account permanently removes every record. Export first if you want a copy."
            />
            <Button
              label="Delete account"
              icon="trash-2"
              variant="danger"
              full
              onPress={() => setConfirmDelete(true)}
            />
          </View>
        </View>
      </ScreenScroll>

      <ConfirmationDialog
        visible={confirmSample}
        title="Load a sample week?"
        message="This adds realistic demo records to your account so you can explore the complete app. Your existing records are left untouched."
        confirmLabel="Load sample data"
        loading={seeding}
        onCancel={() => setConfirmSample(false)}
        onConfirm={loadSampleWeek}
      />

      <ConfirmationDialog
        visible={confirmDelete}
        title="Delete your account?"
        message="Every task, habit, session, goal and review will be permanently deleted. This cannot be undone."
        destructive
        confirmLabel="Delete everything"
        loading={deleting}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDeleteAccount}
      />

      {confirmDelete ? (
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
            padding: space.base,
            backgroundColor: c.surface1,
            borderRadius: radius.card,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: c.line,
          }}>
          <TextField
            label="Confirm with your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Required if you signed in a while ago"
          />
        </View>
      ) : null}
    </Screen>
  );
}
