/**
 * Consent + progress for the first upload of this device's habits.
 *
 * For existing users this is the first time their data leaves the phone, in
 * an app that previously promised it never would. So the screen states
 * exactly what is sent, where, and who can see it — and "Not now" is always
 * one tap away. The first upload never starts from anywhere else: the
 * background triggers (sync/useSyncTriggers.ts) only sync a device this
 * account has already claimed.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';
import { CloudUpload, CheckCircle2, ShieldCheck, Smartphone, Users, AlertCircle, RefreshCw } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import type { AppDispatch, RootState } from '../store/store';
import { refreshSyncStatus, enableSync } from '../store/syncSlice';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CloudBackup'>;

const ACCENT = '#E86E3C';

function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

interface PointProps {
  icon: React.ReactNode;
  text: string;
}

function Point({ icon, text }: PointProps) {
  return (
    <View style={styles.point}>
      <View style={styles.pointIcon}>{icon}</View>
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

export default function CloudBackupScreen() {
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const sync = useSelector((s: RootState) => s.sync);
  const username = useSelector((s: RootState) => s.auth.profile?.username);

  useEffect(() => {
    dispatch(refreshSyncStatus());
  }, [dispatch]);

  const account = username ? `@${username}` : 'your account';
  const habits = plural(sync.pendingHabits, 'habit');
  const days = plural(sync.pendingCompletions, 'completed day');
  const close = () => navigation.goBack();

  const renderBody = () => {
    switch (sync.status) {
      case 'syncing':
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.title}>Backing up {habits}...</Text>
            <Text style={styles.body}>You can keep using the app. Nothing on this phone changes.</Text>
          </View>
        );

      case 'synced':
        return (
          <View style={styles.center}>
            <CheckCircle2 size={56} color={COLORS.statusTodo} strokeWidth={1.8} />
            <Text style={styles.title}>Backed up</Text>
            <Text style={styles.body}>
              Your habits are saved to {account} and now sync between your devices. They are
              still on this phone too.
            </Text>
            <PrimaryButton label="Done" onPress={close} />
          </View>
        );

      case 'otherOwner':
        return (
          <View style={styles.center}>
            <Users size={52} color={COLORS.textSecondary} strokeWidth={1.8} />
            <Text style={styles.title}>Already backed up elsewhere</Text>
            <Text style={styles.body}>
              The habits on this phone are backed up to a different account, so they won't be
              added to {account}. They stay on this phone either way.
            </Text>
            <PrimaryButton label="Close" onPress={close} />
          </View>
        );

      case 'failed':
        return (
          <View style={styles.center}>
            <AlertCircle size={52} color={COLORS.accentRedDark} strokeWidth={1.8} />
            <Text style={styles.title}>Backup didn't finish</Text>
            {/* Each error carries its own next step ("will retry" vs "sign in
                again"), so nothing generic is appended here. */}
            <Text style={styles.body}>
              {sync.error ?? 'Backup could not finish. Your habits are safe on this phone.'}
            </Text>
            <PrimaryButton label="Try again" onPress={() => dispatch(enableSync({ consent: true }))} />
            <SecondaryButton label="Close" onPress={close} />
          </View>
        );

      case 'needsConsent':
        return (
          <>
            <View style={styles.hero}>
              <CloudUpload size={52} color={ACCENT} strokeWidth={1.8} />
            </View>
            <Text style={styles.title}>Back up this phone's habits?</Text>
            <Text style={styles.body}>
              Copy {habits} and {days} to {account}.
            </Text>

            <View style={styles.points}>
              <Point
                icon={<Smartphone size={18} color={COLORS.textSecondary} strokeWidth={2} />}
                text="Nothing is deleted. Everything stays on this phone too."
              />
              <Point
                icon={<ShieldCheck size={18} color={COLORS.textSecondary} strokeWidth={2} />}
                text="Only you can see your habit names. Friends only ever see milestones, like streaks and bricks."
              />
              <Point
                icon={<RefreshCw size={18} color={COLORS.textSecondary} strokeWidth={2} />}
                text={`From now on, changes sync between this phone and any other device signed in to ${account}. Habits already in ${account} will appear here too.`}
              />
              <Point
                icon={<Users size={18} color={COLORS.textSecondary} strokeWidth={2} />}
                text="Sharing this phone? Only continue if these habits are yours."
              />
            </View>

            <PrimaryButton label={`Back up ${habits}`} onPress={() => dispatch(enableSync({ consent: true }))} />
            <SecondaryButton label="Not now" onPress={close} />
          </>
        );

      default:
        // 'idle': signed out, or local habits still loading.
        return (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={ACCENT} />
          </View>
        );
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>{renderBody()}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.primary} onPress={onPress} accessibilityRole="button" activeOpacity={0.85}>
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.secondary} onPress={onPress} accessibilityRole="button">
      <Text style={styles.secondaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gradientStart,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xxl,
    ...SHADOWS.lg,
  },
  center: {
    alignItems: 'center',
  },
  hero: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(232,110,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: FONT_SIZES.lg,
    lineHeight: 23,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  points: {
    gap: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  pointIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
    color: COLORS.textPrimary,
    paddingTop: 5,
  },
  primary: {
    alignSelf: 'stretch',
    backgroundColor: ACCENT,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  primaryText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
  secondary: {
    alignSelf: 'stretch',
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  secondaryText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
  },
});
