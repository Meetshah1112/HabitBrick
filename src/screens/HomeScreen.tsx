import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Alert, TextInput, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { User, X, Pencil, RotateCcw, Flame, Database, LogIn, LogOut, Cloud } from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import StickyNote from '../components/StickyNote';
import { useHabitStore } from '../store/habitStore';
import { fetchDailyStreakStatus, markCelebrationShown, wasCelebrationShownToday } from '../api/streakService';
import { storageService } from '../api/storageService';
import { resetProgress } from '../store/habitSlice';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../store/store';
import { signOutUser } from '../store/authSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROTATIONS = [-1, 2, -2, 1, 1, -1.5, 0.5, -0.5];

export default function HomeScreen() {
  const { habits } = useHabitStore();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((s: RootState) => s.auth);
  const [accountError, setAccountError] = useState<string | null>(null);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [animatingPinId, setAnimatingPinId] = useState<string | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userName, setUserName] = useState<string>('Aayush');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');

  const handleEditProfilePress = () => {
    setEditNameInput(userName);
    setIsEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (editNameInput.trim()) {
      await AsyncStorage.setItem('@atomicstep/username', editNameInput.trim());
      setUserName(editNameInput.trim());
    }
    setIsEditingProfile(false);
  };

  useEffect(() => {
    const loadName = async () => {
      let storedName = await AsyncStorage.getItem('@atomicstep/username');
      if (!storedName) {
        storedName = await AsyncStorage.getItem('@habitflow/username');
        if (storedName) {
           await AsyncStorage.setItem('@atomicstep/username', storedName);
        }
      }
      setUserName(storedName || 'Champion');
    };
    loadName();
  }, []);

  // Handle pin animation when returning from HabitDetail after marking done
  useEffect(() => {
    const justCompletedId = route.params?.justCompletedId;
    if (justCompletedId) {
      setAnimatingPinId(justCompletedId);
      // Clear the param so it doesn't re-trigger
      navigation.setParams({ justCompletedId: undefined });
      // Reset animation state after animation completes
      const timer = setTimeout(() => setAnimatingPinId(null), 800);
      return () => clearTimeout(timer);
    }
  }, [route.params?.justCompletedId]);

  // Evaluate whether Streak Celebration needs to be shown
  useEffect(() => {
    const checkStreakCelebration = async () => {
      // Small timeout so habit toggle state can settle after navigation
      await new Promise((resolve) => setTimeout(resolve, 800));

      const streakData = await fetchDailyStreakStatus(habits);

      // ── Trigger 1: ALL scheduled habits completed ──
      if (streakData.triggerType === 'allComplete') {
        const alreadyShown = await wasCelebrationShownToday('allComplete');
        if (!alreadyShown) {
          await markCelebrationShown('allComplete');
          navigation.navigate('StreakCelebration', streakData);
          return;
        }
      }

      // ── Trigger 2: ZERO habits completed (checked on app open; acts as
      //    "end of day" penalty for users who open the app after midnight
      //    or first thing next morning without having done anything) ──
      if (streakData.triggerType === 'noneComplete') {
        const alreadyShown = await wasCelebrationShownToday('noneComplete');
        if (!alreadyShown) {
          await markCelebrationShown('noneComplete');
          navigation.navigate('StreakCelebration', streakData);
          return;
        }
      }
    };

    checkStreakCelebration();
  }, [habits, navigation]);

  const handleHabitPress = (habitId: string) => {
    navigation.navigate('HabitDetail', { habitId });
  };

  // iOS can present only one view controller at a time. Navigating to the
  // SignIn modal while this RN <Modal> is still dismissing can drop the
  // navigation silently, so on iOS we wait for onDismiss. Other platforms
  // do not have that constraint and navigate immediately.
  const afterProfileModalDismiss = useRef<(() => void) | null>(null);

  const closeProfileModalThen = (action: () => void) => {
    if (Platform.OS === 'ios') {
      afterProfileModalDismiss.current = action;
      setShowProfileModal(false);
    } else {
      setShowProfileModal(false);
      action();
    }
  };

  const handleProfileModalDismiss = () => {
    const action = afterProfileModalDismiss.current;
    afterProfileModalDismiss.current = null;
    action?.();
  };

  const handleOpenSignIn = () => {
    setAccountError(null);
    closeProfileModalThen(() => navigation.navigate('SignIn'));
  };

  // Signing out keeps every local habit: data belongs to the device, and the
  // app keeps working offline exactly as before. No confirmation needed —
  // it is fully reversible by signing back in.
  const handleSignOut = async () => {
    setAccountError(null);
    const result = await dispatch(signOutUser());
    if (signOutUser.rejected.match(result)) {
      setAccountError((result.payload as string) ?? 'Could not sign out. Try again.');
    }
  };

  const handleResetProgress = async () => {
    try {
      // 1. Clear Storage
      await storageService.resetAllAppData();
      
      // 2. Set new account creation date (behave like new user)
      const today = new Date().toISOString().split('T')[0];
      await AsyncStorage.setItem('@atomicstep/accountCreatedAt', today);
      // KeepLoggedIn but reset name
      await AsyncStorage.setItem('@atomicstep/isLoggedIn', 'true');
      
      // 3. Reset Redux State
      dispatch(resetProgress());
      
      // 4. Close Modal and Navigate
      setShowProfileModal(false);
      
      // navigation.reset to ensure they can't go back to old home
      navigation.reset({
        index: 0,
        routes: [{ name: 'Tabs', params: { screen: 'AddHabit' } }],
      });
    } catch (e) {
      console.error('Failed to reset progress', e);
      Alert.alert('Error', 'Failed to reset data. Please try again.');
    }
  };

  const handleTestAnimation = async () => {
    const streakData = await fetchDailyStreakStatus(habits);
    navigation.navigate('StreakCelebration', {
      ...streakData,
      // Force a trigger type so the test always shows something
      triggerType: streakData.triggerType === 'none' ? 'allComplete' : streakData.triggerType,
    });
  };

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning ☀️';
    if (hour < 18) return 'Good Afternoon 🌤';
    return 'Good Evening 🌙';
  };

  const todayDate = new Date();
  // Convert JS getDay() (0=Sun) to HabitBrick (Mon=0, Sun=6)
  const todayDayOfWeek = todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1;

  const todaysHabits = habits.filter(h => h.frequency[todayDayOfWeek]);
  const completedCount = todaysHabits.filter(h => h.completedToday).length;
  const totalCount = todaysHabits.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const maxStreak = Math.max(0, ...habits.map(h => h.currentStreak));

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>{getTimeGreeting()}</Text>
            <Text style={styles.headerTitle}>{userName}</Text>
          </View>
          <TouchableOpacity style={styles.avatar} onPress={() => setShowProfileModal(true)}>
            <User size={24} color={COLORS.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* Top Streak Board */}
        <TouchableOpacity style={styles.streakBoard} activeOpacity={0.9} onPress={handleTestAnimation}>
          <View style={styles.streakInfoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Flame size={18} color="#F97316" strokeWidth={2} fill="#FED7AA" />
              <Text style={styles.streakBoardText}>{maxStreak} Day Streak</Text>
            </View>
            <Text style={styles.streakBoardSubtext}>{completedCount}/{totalCount} Done</Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
        </TouchableOpacity>

        {/* Sticky Notes Grid */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {habits.map((habit, index) => (
              <StickyNote
                key={habit.id}
                habit={habit}
                onPress={handleHabitPress}
                rotation={ROTATIONS[index % ROTATIONS.length]}
                animatePin={animatingPinId === habit.id}
                isScheduledToday={habit.frequency[todayDayOfWeek]}
              />
            ))}
          </View>
        </ScrollView>

        {/* Profile Modal */}
        <Modal
          visible={showProfileModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowProfileModal(false)}
          onDismiss={handleProfileModalDismiss}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{isEditingProfile ? 'Edit Profile' : 'Profile & Settings'}</Text>
                <TouchableOpacity onPress={() => { setShowProfileModal(false); setIsEditingProfile(false); }}>
                  <X size={24} color={COLORS.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
              </View>

              {isEditingProfile ? (
                <View style={{ marginBottom: 20 }}>
                  <View style={styles.inputWrapper}>
                    <User size={20} color={COLORS.textSecondary} strokeWidth={1.8} style={{ marginRight: 10 }} />
                    <TextInput
                      style={styles.modalInput}
                      value={editNameInput}
                      onChangeText={setEditNameInput}
                      placeholder="Enter your name"
                      autoFocus
                    />
                  </View>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveProfile}>
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.modalButton} onPress={handleEditProfilePress}>
                    <Pencil size={24} color={COLORS.textPrimary} strokeWidth={2} />
                    <Text style={styles.modalButtonText}>Edit Profile</Text>
                  </TouchableOpacity>

                  {/* Optional cloud account. Hidden in builds without cloud config. */}
                  {auth.isCloudEnabled && auth.status === 'signedOut' && (
                    <TouchableOpacity style={styles.modalButton} onPress={handleOpenSignIn}>
                      <LogIn size={24} color={COLORS.textPrimary} strokeWidth={2} />
                      <View style={styles.accountTextBlock}>
                        <Text style={styles.modalButtonText}>Sign in or create account</Text>
                        <Text style={styles.accountSubtext}>Back up your bricks and add friends</Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {auth.isCloudEnabled && auth.status === 'signedIn' && (
                    <>
                      <View style={styles.modalButton}>
                        <Cloud size={24} color={COLORS.statusTodo} strokeWidth={2} />
                        <View style={styles.accountTextBlock}>
                          <Text style={styles.modalButtonText}>
                            {auth.profile ? `@${auth.profile.username}` : 'Signed in'}
                          </Text>
                          <Text style={styles.accountSubtext}>Cloud backup arrives in the next update</Text>
                        </View>
                      </View>
                      <TouchableOpacity style={styles.modalButton} onPress={handleSignOut}>
                        <LogOut size={24} color={COLORS.textPrimary} strokeWidth={2} />
                        <Text style={styles.modalButtonText}>Sign out</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {accountError && <Text style={styles.accountError}>{accountError}</Text>}

                  <TouchableOpacity
                    style={[styles.modalButton, styles.dangerButton]}
                    onPress={() => Alert.alert(
                      'Reset Progress',
                      'Are you sure you want to reset all your habit data? This will permanently delete your habits, streaks, and achievements.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { 
                          text: 'Reset Everything', 
                          style: 'destructive', 
                          onPress: handleResetProgress 
                        }
                      ]
                    )}
                  >
                    <RotateCcw size={24} color={COLORS.accentRed} strokeWidth={2} />
                    <Text style={[styles.modalButtonText, { color: COLORS.accentRed }]}>Reset Progress</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  greetingText: {
    fontSize: FONT_SIZES.md,
    color: '#737373', // soft grey from image
    fontWeight: '600',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#212121', // almost black
    letterSpacing: -0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E5DFD4',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  streakBoard: {
    backgroundColor: '#F5F2ED', // very pale off-white
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.xl,
    ...SHADOWS.md,
  },
  streakInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  streakBoardText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#404040',
  },
  streakBoardSubtext: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: '#737373',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E5E5E5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#E86E3C', // vibrant soft orange
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: 36, // Extra room for the pin image that overhangs above the card
    paddingBottom: 140, // More room for big overlapping nav
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: SPACING.lg,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    paddingBottom: 40,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderBottomWidth: 4,
    borderColor: COLORS.border,
  },
  dangerButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  accountTextBlock: {
    flex: 1,
  },
  accountSubtext: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  accountError: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.accentRedDark,
    marginBottom: SPACING.md,
  },
  modalButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: SPACING.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FC',
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    height: 50,
    paddingHorizontal: 14,
    marginBottom: SPACING.lg,
  },
  modalInput: {
    flex: 1,
    height: '100%',
    fontSize: FONT_SIZES.md,
    color: '#0F172A',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#059669',
    borderRadius: BORDER_RADIUS.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  saveButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
  },
});
