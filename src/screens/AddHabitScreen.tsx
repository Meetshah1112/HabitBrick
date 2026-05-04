import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check } from 'lucide-react-native';
import { CategoryIcon } from '../components/CategoryIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { HabitCategory, CATEGORY_CONFIG } from '../types';
import { useHabitStore } from '../store/habitStore';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';

const ROTATIONS = [-2, 1, -1, 3, 0.5, -1.5, 2, -0.5, 1.5, -2, 1, -1];

const CATEGORIES: { key: HabitCategory; rotation: number }[] =
  (Object.keys(CATEGORY_CONFIG) as HabitCategory[]).map((key, i) => ({
    key,
    rotation: ROTATIONS[i % ROTATIONS.length],
  }));

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function AddHabitScreen({ navigation }: any) {
  const { addHabit } = useHabitStore();
  const habitCount = useSelector((s: RootState) => s.habits.habits.length);
  const isFirstHabit = habitCount === 0;
  const [selectedCategory, setSelectedCategory] = useState<HabitCategory | null>(null);
  const [habitLabel, setHabitLabel] = useState('');
  const [description, setDescription] = useState('');
  const [selectedDays, setSelectedDays] = useState<boolean[]>([true, false, true, false, true, false, false]);
  const [showSelfPromise, setShowSelfPromise] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Only reset the form on actual screen focus (when navigating to this tab)
      setSelectedCategory(null);
      setHabitLabel('');
      setDescription('');
      setSelectedDays([true, false, true, false, true, false, false]);
    }, []) // Empty dependency array ensures this only runs on focus!
  );

  // Separate effect specifically for the back button, relying on current state
  useEffect(() => {
    const onBackPress = () => {
      if (selectedCategory) {
        setSelectedCategory(null);
        setHabitLabel('');
        setDescription('');
        setSelectedDays([true, false, true, false, true, false, false]);
        return true; 
      }
      
      if (isFirstHabit) {
        return true; // Stop them from going back without adding a habit
      }
      
      return false;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => backHandler.remove();
  }, [selectedCategory, isFirstHabit]);

  const targetDays = selectedDays.filter(Boolean).length;

  const toggleDay = (index: number) => {
    const newDays = [...selectedDays];
    newDays[index] = !newDays[index];
    setSelectedDays(newDays);
  };

  const handleAddHabit = () => {
    if (!selectedCategory) {
      Alert.alert('Select Category', 'Please select a habit category first.');
      return;
    }
    if (!habitLabel.trim()) {
      Alert.alert('Enter Label', 'Please enter a habit name.');
      return;
    }
    setShowSelfPromise(true);
  };

  const confirmHabitCreation = () => {
    addHabit({
      title: habitLabel.trim(),
      description: description.trim() || undefined,
      category: selectedCategory!,
      frequency: selectedDays,
      targetDaysPerWeek: targetDays,
    });
    setShowSelfPromise(false);
    // Explicitly navigate to Home tab
    navigation.navigate('Tabs', { screen: 'Home' });
  };

  const handleBack = () => {
    if (selectedCategory) {
      setSelectedCategory(null);
      setHabitLabel('');
      setDescription('');
      setSelectedDays([true, false, true, false, true, false, false]);
    } else if (!isFirstHabit) {
      navigation.goBack();
    }
    // If isFirstHabit and no category selected, do nothing — they must add a habit
  };

  const selectedConfig = selectedCategory ? CATEGORY_CONFIG[selectedCategory] : null;

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          {/* Hide back button during onboarding (first habit). Show it otherwise. */}
          {(!isFirstHabit || !!selectedCategory) ? (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <ArrowLeft size={24} color={COLORS.textPrimary} strokeWidth={2} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backButton} />
          )}
          <Text style={styles.headerTitle}>
            {isFirstHabit ? 'Create Your First Habit 🚀' : 'Add Habit'}
          </Text>
        </View>

      {!selectedCategory ? (
        /* Step 1: Category Selection */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Select Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(({ key, rotation }) => {
              const config = CATEGORY_CONFIG[key];
              return (
                <TouchableOpacity
                  key={key}
                  activeOpacity={0.9}
                  onPress={() => setSelectedCategory(key)}
                  style={[
                    styles.mockStickyNote,
                    {
                      backgroundColor: config.stickyColor,
                      transform: [{ rotate: `${rotation}deg` }],
                    },
                  ]}
                >


                  {/* Center Icon */}
                  <View style={styles.centerIconContainer}>
                    <View style={styles.iconCircle}>
                      <CategoryIcon
                        category={key}
                        size={28}
                        color={config.textColor}
                        strokeWidth={2}
                      />
                    </View>
                  </View>

                  {/* Title */}
                  <View style={styles.textContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                      {config.label}
                    </Text>
                  </View>

                  <View style={styles.innerHighlight} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* Step 2: Habit Details */
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.stepTitle}>Set Up Your Habit</Text>

          {/* Selected category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: selectedConfig!.color, borderColor: selectedConfig!.borderColor }]}>
            <CategoryIcon
              category={selectedCategory!}
              size={16}
              color={selectedConfig!.textColor}
              strokeWidth={2}
            />
            <Text style={[styles.categoryBadgeText, { color: selectedConfig!.textColor }]}>
              {selectedConfig!.label}
            </Text>
          </View>

          {/* Why Reason */}
          <View style={styles.whyContainer}>
            <Text style={styles.whyTitle}>Why this matters</Text>
            <Text style={styles.whyText}>{selectedConfig!.whyReason}</Text>
          </View>

          {/* Detail Form */}
          <View style={styles.formContainer}>
            {/* Mac-style window dots */}
            <View style={styles.formHeader}>
              <View style={styles.dotsRow}>
                <View style={[styles.dot, { backgroundColor: '#F87171' }]} />
                <View style={[styles.dot, { backgroundColor: '#FACC15' }]} />
                <View style={[styles.dot, { backgroundColor: '#4ADE80' }]} />
              </View>
              <Text style={styles.formHeaderLabel}>DETAILS</Text>
            </View>

            <View style={styles.formBody}>
              {/* Habit Label */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>HABIT LABEL</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder={selectedConfig!.placeholder}
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={habitLabel}
                  onChangeText={setHabitLabel}
                />
              </View>

              {/* Description */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>DESCRIPTION (OPTIONAL)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Write a note..."
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Frequency */}
              <View style={[styles.fieldGroup, { paddingTop: SPACING.lg }]}>
                <Text style={styles.fieldLabel}>FREQUENCY</Text>
                <View style={styles.daysRow}>
                  {DAY_LABELS.map((day, index) => (
                    <TouchableOpacity
                      key={index}
                      onPress={() => toggleDay(index)}
                      style={styles.dayColumn}
                    >
                      <Text style={styles.dayLabel}>{day}</Text>
                      <View
                        style={[
                          styles.dayCircle,
                          selectedDays[index] && styles.dayCircleSelected,
                        ]}
                      >
                        {selectedDays[index] && (
                          <Check size={14} color={COLORS.accentOrange} strokeWidth={3} />
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={styles.targetRow}>
                  <Text style={styles.targetLabel}>Target days per week:</Text>
                  <View style={styles.targetBadge}>
                    <Text style={styles.targetText}>{targetDays} days per week</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.addButton} onPress={handleAddHabit}>
              <Text style={styles.addButtonText}>Add Habit</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBack}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <Modal
            visible={showSelfPromise}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSelfPromise(false)}
          >
            <View style={styles.promiseBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowSelfPromise(false)} />
              <View style={styles.promiseCard}>
                <Text style={styles.promiseEyebrow}>SELF PROMISE</Text>
                <Text style={styles.promiseTitle}>You are about to make this real.</Text>
                <Text style={styles.promiseBody}>
                  Small actions done consistently become identity. Commit to this habit now, and let future you
                  thank you later.
                </Text>

                <View style={styles.promiseNote}>
                  <Text style={styles.promiseNoteText}>
                    I will show up, even when motivation is low.
                  </Text>
                </View>

                <View style={styles.promiseActions}>
                  <TouchableOpacity
                    style={styles.promiseSecondaryButton}
                    onPress={() => setShowSelfPromise(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.promiseSecondaryText}>Not yet</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.promisePrimaryButton}
                    onPress={confirmHabitCreation}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.promisePrimaryText}>I make this promise</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      )}
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
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 4,
    marginRight: SPACING.md,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#212121',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: 140,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#404040',
    marginBottom: SPACING.lg,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: SPACING.lg,
  },
  mockStickyNote: {
    width: '47%',
    aspectRatio: 1, // Make it more square like sticky notes
    borderRadius: BORDER_RADIUS.md,
    padding: 16,
    paddingBottom: 16,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
    ...SHADOWS.md,
  },

  centerIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderTopRightRadius: BORDER_RADIUS.md,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING.xxl,
  },
  categoryBadgeText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
  },
  whyContainer: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xxl,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accentOrange,
  },
  whyTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  whyText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  formContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.12,
    shadowRadius: 50,
    elevation: 8,
    marginBottom: SPACING.xxxl,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  formHeaderLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
  },
  formBody: {
    padding: SPACING.xxl,
    gap: SPACING.xxl,
  },
  fieldGroup: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: -0.6,
    textTransform: 'uppercase',
  },
  textInput: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '500',
    color: COLORS.textPrimary,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textArea: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '400',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  daysRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    height: 32,
    lineHeight: 32,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    borderColor: COLORS.accentOrange,
    backgroundColor: 'rgba(236,91,19,0.1)',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  targetLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  targetBadge: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  targetText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: '#334155',
  },
  actions: {
    gap: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
  },
  addButton: {
    backgroundColor: COLORS.accentRed,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 6,
  },
  addButtonText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.white,
  },
  cancelText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
    color: COLORS.textTertiary,
  },
  promiseBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  promiseCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 10,
  },
  promiseEyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '800',
    letterSpacing: 1.8,
    color: COLORS.accentOrange,
    marginBottom: SPACING.sm,
  },
  promiseTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 32,
    marginBottom: SPACING.md,
  },
  promiseBody: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
  },
  promiseNote: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
  },
  promiseNoteText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  promiseActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  promiseSecondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  promiseSecondaryText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  promisePrimaryButton: {
    flex: 1.4,
    minHeight: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentOrange,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  promisePrimaryText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.white,
  },
});
