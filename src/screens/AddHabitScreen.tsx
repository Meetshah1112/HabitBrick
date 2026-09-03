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
import { ArrowLeft, Check, Sparkles } from 'lucide-react-native';
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

/**
 * Curated quick-pick habit suggestions.
 *
 * Each suggestion maps to an existing HabitCategory so the rest of the app
 * (sticky-note color, why-reason fallback, icon) just works. The `whyReason`
 * here is a per-habit override that pre-fills the description field, giving
 * the user a tailored acknowledgement instead of the category's generic one.
 *
 * When tapped, the suggestion populates selectedCategory + habitLabel +
 * description, which advances to Step 2. From there the existing flow runs
 * unchanged: frequency picker → self-promise modal → addHabit() → checklist,
 * alarms, notifications, etc. all attach via HabitDetailScreen.
 */
interface SuggestedHabit {
  title: string;
  category: HabitCategory;
  whyReason: string;
}

const SUGGESTED_HABITS: SuggestedHabit[] = [
  { title: 'Learn one good thing',         category: 'academics',    whyReason: 'A single new idea a day compounds into deep expertise over months and years.' },
  { title: 'Help someone',                 category: 'volunteering', whyReason: 'Helping others increases your own happiness and strengthens your sense of purpose.' },
  { title: 'Self introspection',           category: 'mindfulness',  whyReason: 'Looking inward each day reveals patterns you would otherwise repeat unconsciously.' },
  { title: 'Sleep at a fixed time',        category: 'sleep',        whyReason: 'A consistent bedtime trains your body clock and improves the quality of every hour you sleep.' },
  { title: 'Maintain a diary',             category: 'creativity',   whyReason: 'Writing down your thoughts clears the mind and creates a record of your growth.' },
  { title: 'Plan your day',                category: 'productivity', whyReason: 'Ten minutes of planning saves hours of reactive busywork.' },
  { title: 'Think twice before you speak', category: 'mindfulness',  whyReason: 'Pausing before responding prevents most misunderstandings and regrets.' },
  { title: 'Do not be angry',              category: 'mindfulness',  whyReason: 'Anger clouds judgment; calmness keeps you in control of the outcome.' },
  { title: 'Make new friends',             category: 'social',       whyReason: 'New relationships open you to fresh perspectives and unexpected opportunities.' },
  { title: 'Work-life balance',            category: 'selfcare',     whyReason: 'Rest is not the opposite of work — it is what makes great work possible.' },
  { title: 'Eat a meal with family',       category: 'social',       whyReason: 'Shared meals are the simplest and most reliable way to stay close to the people you love.' },
  { title: 'Reduce TV or mobile time',     category: 'selfcare',     whyReason: 'Less passive scrolling means more time and energy for things that fill you up.' },
  { title: 'Surprise your child with a small gift', category: 'social', whyReason: 'Small, unexpected gestures build a lifelong feeling of being seen and loved.' },
  { title: 'Be a role model for your child', category: 'social',     whyReason: 'Children learn far more from what you do than from what you say.' },
  { title: 'Set goals for the week',       category: 'productivity', whyReason: 'Clear goals turn vague hopes into concrete next actions.' },
  { title: 'Motivate someone today',       category: 'social',       whyReason: 'A few words of encouragement can change the trajectory of someone’s day.' },
  { title: 'Develop a positive attitude',  category: 'mindfulness',  whyReason: 'How you frame what happens to you matters more than what actually happens.' },
  { title: 'Communicate effectively',      category: 'social',       whyReason: 'Saying what you mean clearly is one of the highest-leverage skills you can build.' },
  { title: 'Drink milk daily',             category: 'nutrition',    whyReason: 'Daily nourishment is the foundation everything else in your day stands on.' },
  { title: 'Do something for mankind',     category: 'volunteering', whyReason: 'Small contributions, repeated daily, add up to a life that mattered.' },
  { title: 'Feed birds and animals',       category: 'pets',         whyReason: 'Caring for other living things reconnects you with the world beyond your screen.' },
  { title: 'Do a regular prayer',          category: 'mindfulness',  whyReason: 'A daily ritual of reflection brings calm, gratitude, and perspective.' },
  { title: 'Do not waste food',            category: 'nutrition',    whyReason: 'Respecting food respects the people, land, and effort that put it on your plate.' },
  { title: 'Save water',                   category: 'cleaning',     whyReason: 'Every saved drop is a small daily vote for a planet your children can drink from.' },
  { title: 'Plant a tree',                 category: 'gardening',    whyReason: 'You will probably never sit in its shade — and that is exactly why it matters.' },
  { title: 'Save petrol or diesel',        category: 'finance',      whyReason: 'Driving less saves money in the short term and protects the climate in the long term.' },
  { title: 'Clean your desk',              category: 'cleaning',     whyReason: 'A clear surface clears the mind; a cluttered surface costs focus all day.' },
];

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

  /**
   * Apply a curated suggestion → pre-fills category, label, and description,
   * then drops the user into Step 2 to confirm frequency and submit. The
   * downstream creation flow (self-promise modal, addHabit, alarms,
   * checklist, notifications) is identical to a manually-entered habit.
   */
  const handleSuggestionPick = (suggestion: SuggestedHabit) => {
    setSelectedCategory(suggestion.category);
    setHabitLabel(suggestion.title);
    setDescription(suggestion.whyReason);
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
          {/* ── Suggested Habits — quick-pick row ───────────────────── */}
          <View style={styles.suggestionsHeader}>
            <Sparkles size={16} color={COLORS.accentOrange} strokeWidth={2.4} />
            <Text style={styles.suggestionsTitle}>Suggested Habits</Text>
          </View>
          <Text style={styles.suggestionsSubtitle}>
            Tap to pre-fill — you can still tweak everything before saving.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsRow}
            style={styles.suggestionsScroll}
          >
            {SUGGESTED_HABITS.map((s) => {
              const config = CATEGORY_CONFIG[s.category];
              return (
                <TouchableOpacity
                  key={s.title}
                  activeOpacity={0.85}
                  onPress={() => handleSuggestionPick(s)}
                  style={[styles.suggestionChip, { backgroundColor: config.stickyColor }]}
                >
                  <View style={styles.suggestionIconRow}>
                    <View style={[styles.suggestionIconCircle, { backgroundColor: 'rgba(255,255,255,0.55)' }]}>
                      <CategoryIcon
                        category={s.category}
                        size={16}
                        color={config.textColor}
                        strokeWidth={2}
                      />
                    </View>
                    <Text style={[styles.suggestionCategoryTag, { color: config.textColor }]}>
                      {config.label}
                    </Text>
                  </View>
                  <Text style={styles.suggestionTitle} numberOfLines={2}>
                    {s.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Divider between suggestions and manual category selection */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>OR PICK A CATEGORY</Text>
            <View style={styles.dividerLine} />
          </View>

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

  // ── Suggested habits row ───────────────────────────────────────────
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  suggestionsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: -0.3,
  },
  suggestionsSubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
    marginBottom: SPACING.md,
    fontWeight: '500',
  },
  // Pull the horizontal scroll out of the page gutter so chips can bleed
  // toward both edges, with internal contentContainer padding restoring it.
  suggestionsScroll: {
    marginHorizontal: -SPACING.xl,
    marginBottom: SPACING.lg,
  },
  suggestionsRow: {
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
    paddingVertical: 4, // give shadow room to render
  },
  suggestionChip: {
    width: 168,
    minHeight: 96,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    ...SHADOWS.sm,
  },
  suggestionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionCategoryTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    flex: 1,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F1D1B',
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  // ── Divider between suggestions and manual selection ──────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(31, 29, 27, 0.10)',
  },
  dividerLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.4,
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
