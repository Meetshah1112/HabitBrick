import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useHabitStore } from '../store/habitStore';
import { LinearGradient } from 'expo-linear-gradient';
import { Habit, CATEGORY_CONFIG } from '../types';
import { getLocalDateStr } from '../store/habitSlice';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CategoryIcon } from '../components/CategoryIcon';
import { computeHabitStats, getBestPerformingHabits, formatRate } from '../utils/habitStats';

const CHART_HEIGHT = 140;

type TimePeriod = 'days' | 'weeks' | 'months';

const DAYS_OF_WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function computeChartData(habits: Habit[], timePeriod: TimePeriod, accountCreatedAt: string | null): { label: string; value: number }[] {
  const today = new Date();

  if (timePeriod === 'days') {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - i));
      const dateStr = getLocalDateStr(date);
      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;

      // NEUTRALITY: If before account creation, value is 0
      if (accountCreatedAt && dateStr < accountCreatedAt) return { label: DAY_LABELS[dayOfWeek], value: 0 };

      const activeHabits = habits.filter((h) => h.frequency[dayOfWeek]);
      if (activeHabits.length === 0) return { label: DAY_LABELS[dayOfWeek], value: 0 };
      const completed = activeHabits.filter((h) => h.completionLog[dateStr]).length;
      return { label: DAY_LABELS[dayOfWeek], value: completed / activeHabits.length };
    });
  }

  if (timePeriod === 'weeks') {
    return Array.from({ length: 7 }, (_, weekIdx) => {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - (6 - weekIdx) * 7);
      let totalRatio = 0;
      let daysCount = 0;
      for (let d = 6; d >= 0; d--) {
        const date = new Date(weekEnd);
        date.setDate(date.getDate() - d);
        if (date > today) continue;
        const dateStr = getLocalDateStr(date);
        
        // Neutrality Check
        if (accountCreatedAt && dateStr < accountCreatedAt) continue;

        const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
        const activeHabits = habits.filter((h) => h.frequency[dayOfWeek]);
        if (activeHabits.length === 0) continue;
        const completed = activeHabits.filter((h) => h.completionLog[dateStr]).length;
        totalRatio += completed / activeHabits.length;
        daysCount++;
      }
      return { label: `W${weekIdx + 1}`, value: daysCount > 0 ? totalRatio / daysCount : 0 };
    });
  }

  // months
  return Array.from({ length: 7 }, (_, monthIdx) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (6 - monthIdx), 1);
    const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
    let totalRatio = 0;
    let daysCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), d);
      if (date > today) break;
      const dateStr = getLocalDateStr(date);

      // Neutrality Check
      if (accountCreatedAt && dateStr < accountCreatedAt) continue;

      const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
      const activeHabits = habits.filter((h) => h.frequency[dayOfWeek]);
      if (activeHabits.length === 0) continue;
      const completed = activeHabits.filter((h) => h.completionLog[dateStr]).length;
      totalRatio += completed / activeHabits.length;
      daysCount++;
    }
    return { label: MONTH_LABELS[monthDate.getMonth()], value: daysCount > 0 ? totalRatio / daysCount : 0 };
  });
}

export default function InsightsScreen({ route }: any) {
  const { habits } = useHabitStore();
  const navigation = useNavigation<any>();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('days');
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    const fetchMeta = async () => {
      const created = await AsyncStorage.getItem('@atomicstep/accountCreatedAt');
      setAccountCreatedAt(created);
    };
    fetchMeta();
  }, []);

  // A habit can be focused two ways: via route param (deep link) or by tapping
  // a row in "Best Performing" (local override). Local override wins, and is
  // cleared by the header back button — keeping everything inside this tab.
  const [focusedHabitId, setFocusedHabitId] = useState<string | null>(null);
  const habitId = focusedHabitId ?? route?.params?.habitId;
  const habit = habitId ? habits.find((h) => h.id === habitId) : habits[0];

  const chartHabits = habitId && habit ? [habit] : habits;
  const chartData = useMemo(() => computeChartData(chartHabits, timePeriod, accountCreatedAt), [chartHabits, timePeriod, accountCreatedAt]);

  // Single-habit view → success rate. Aggregate view → best performers.
  const isSingleHabit = !!(habitId && habit);
  const singleHabitStats = useMemo(
    () => (isSingleHabit ? computeHabitStats(habit!, accountCreatedAt) : null),
    [isSingleHabit, habit, accountCreatedAt],
  );
  const bestPerformers = useMemo(
    () => (isSingleHabit ? [] : getBestPerformingHabits(habits, accountCreatedAt, 3)),
    [isSingleHabit, habits, accountCreatedAt],
  );

  const [showModal, setShowModal] = useState(false);
  const [selectedCompletedHabits, setSelectedCompletedHabits] = useState<Habit[]>([]);
  const [selectedScheduledHabits, setSelectedScheduledHabits] = useState<Habit[]>([]);
  const [selectedDateDisplay, setSelectedDateDisplay] = useState<string>('');

  // Calendar navigation state
  const [currentMonthModifier, setCurrentMonthModifier] = useState(0);

  // Calendar data
  const calendarDateContext = new Date();
  calendarDateContext.setMonth(calendarDateContext.getMonth() + currentMonthModifier);
  const monthName = calendarDateContext.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Generate calendar days
  const firstDay = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth(), 1);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth() + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth(), 0).getDate();

  const calendarDays: { day: number; isCurrentMonth: boolean; isCompleted: boolean; isMissed: boolean; isNotScheduled: boolean; dateStr?: string; completedHabits: Habit[]; scheduledHabits: Habit[] }[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Previous month days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isCompleted: false, isMissed: false, isNotScheduled: false, completedHabits: [], scheduledHabits: [] });
  }
  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${calendarDateContext.getFullYear()}-${String(calendarDateContext.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
    
    // Find all habits completed on this date
    const completedOnThisDate = habits.filter(h => h.completionLog[dateStr]);
    
    // Find scheduled habits
    const scheduledOnThisDate = habitId
        ? (habit?.frequency[dayOfWeek] ? [habit] : [])
        : habits.filter((h) => h.frequency[dayOfWeek]);
        
    const isCompleted = habitId 
      ? !!habit?.completionLog[dateStr] 
      : completedOnThisDate.length > 0;
      
    const isNotScheduled = scheduledOnThisDate.length === 0;

    // Figure out if missed (past or today, scheduled but none completed)
    let isMissed = false;
    if (dateObj <= today && !isCompleted && !isNotScheduled) {
       // Calculation of valid tracking period
       const isAfterAccount = !accountCreatedAt || dateStr >= accountCreatedAt;
       const isAfterHabit = !habitId || (habit && dateStr >= habit.createdAt);

       if (isAfterAccount && isAfterHabit) {
         isMissed = true;
       }
    }
      
    calendarDays.push({ 
      day: i, 
      isCurrentMonth: true, 
      isCompleted,
      isMissed,
      isNotScheduled,
      dateStr,
      completedHabits: habitId ? (isCompleted && habit ? [habit] : []) : completedOnThisDate,
      scheduledHabits: scheduledOnThisDate
    });
  }

  // Back: clear a local focus first; otherwise pop the stack (deep-link case).
  const handleHeaderBack = () => {
    if (focusedHabitId) {
      setFocusedHabitId(null);
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleDatePress = (item: typeof calendarDays[0]) => {
    if (!item.isCurrentMonth) return;
    setSelectedCompletedHabits(item.completedHabits);
    setSelectedScheduledHabits(item.scheduledHabits);
    const dateObj = new Date(item.dateStr!);
    setSelectedDateDisplay(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setShowModal(true);
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          {isSingleHabit ? (
            <TouchableOpacity style={styles.headerIconBtn} onPress={handleHeaderBack}>
              <MaterialIcons name="arrow-back" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIconBtn} />
          )}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {isSingleHabit ? habit!.title : 'Insights'}
          </Text>
          {/* Invisible placeholder to keep the title perfectly centered */}
          <View style={styles.headerIconBtn} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Success Rate — single-habit view only */}
          {isSingleHabit && singleHabitStats && (
            <View style={styles.successCard}>
              <View style={styles.successHeader}>
                <View style={styles.successIconBadge}>
                  <CategoryIcon category={habit!.category} size={18} color={COLORS.white} strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.successLabel}>SUCCESS RATE</Text>
                  <Text style={styles.successHabitTitle} numberOfLines={1}>{habit!.title}</Text>
                </View>
                <Text style={styles.successPercent}>{formatRate(singleHabitStats.successRate)}</Text>
              </View>

              {/* Progress bar */}
              <View style={styles.successBarTrack}>
                <View style={[styles.successBarFill, { width: `${Math.round(singleHabitStats.successRate * 100)}%` }]} />
              </View>

              {/* Sub-stats */}
              <View style={styles.successStatsRow}>
                <SuccessStat value={`${singleHabitStats.completedDays}/${singleHabitStats.scheduledDays}`} label="Days done" />
                <View style={styles.successStatDivider} />
                <SuccessStat value={`${habit!.currentStreak}`} label="Current streak" />
                <View style={styles.successStatDivider} />
                <SuccessStat value={`${habit!.longestStreak}`} label="Best streak" />
              </View>
            </View>
          )}

          {/* Best Performing Habits — aggregate view only */}
          {!isSingleHabit && bestPerformers.length > 0 && (
            <View style={styles.bestCard}>
              <Text style={styles.bestHeader}>🏆 Best Performing Habits</Text>
              {bestPerformers.map((r, idx) => (
                <TouchableOpacity
                  key={r.habit.id}
                  style={styles.bestRow}
                  activeOpacity={0.7}
                  onPress={() => setFocusedHabitId(r.habit.id)}
                >
                  <Text style={styles.bestRank}>{idx + 1}</Text>
                  <View style={[styles.bestIconBadge, { backgroundColor: CATEGORY_CONFIG[r.habit.category].accentColor }]}>
                    <CategoryIcon category={r.habit.category} size={16} color={COLORS.white} strokeWidth={2.4} />
                  </View>
                  <View style={styles.bestRowText}>
                    <Text style={styles.bestRowTitle} numberOfLines={1}>{r.habit.title}</Text>
                    <View style={styles.bestRowBarTrack}>
                      <View style={[styles.bestRowBarFill, { width: `${Math.round(r.stats.successRate * 100)}%` }]} />
                    </View>
                  </View>
                  <Text style={styles.bestRowPercent}>{formatRate(r.stats.successRate)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Consistency Graph */}
          <View style={styles.graphContainer}>
            {/* Tape effect */}
            <View style={styles.tape} />
            <View style={styles.graphHeader}>
              <View>
                <Text style={styles.graphTitle}>CONSISTENCY</Text>
                <Text style={styles.graphTitle}>GRAPH</Text>
              </View>
              <View style={styles.periodButtons}>
                {(['days', 'weeks', 'months'] as TimePeriod[]).map((period) => (
                  <TouchableOpacity
                    key={period}
                    onPress={() => setTimePeriod(period)}
                    style={[
                      styles.periodButton,
                      timePeriod === period ? styles.periodButtonActive : styles.periodButtonInactive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.periodButtonText,
                        timePeriod !== period && styles.periodButtonTextInactive,
                      ]}
                    >
                      {period.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Bar Chart */}
            <View style={styles.chartArea}>
              <View style={styles.barsContainer}>
                {chartData.map((bar, index) => (
                  <View key={index} style={styles.barColumn}>
                    <View style={styles.barWrapper}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${bar.value * 100}%`,
                            backgroundColor: `rgba(232,110,60,${0.3 + bar.value * 0.7})`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{bar.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {/* Calendar */}
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <Text style={styles.calendarTitle}>{monthName}</Text>
              <View style={styles.calendarNav}>
                <TouchableOpacity onPress={() => setCurrentMonthModifier(m => m - 1)} activeOpacity={0.6}>
                  <MaterialIcons name="chevron-left" size={24} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCurrentMonthModifier(m => m + 1)} disabled={currentMonthModifier >= 0} activeOpacity={0.6} style={{ opacity: currentMonthModifier >= 0 ? 0.3 : 1 }}>
                  <MaterialIcons name="chevron-right" size={24} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Day labels */}
            <View style={styles.calendarDayLabels}>
              {DAYS_OF_WEEK.map((day, i) => (
                <Text key={i} style={styles.calendarDayLabel}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarDays.slice(0, 42).map((item, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.calendarCell}
                  onPress={() => handleDatePress(item)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.calendarDateWrapper,
                    item.isCurrentMonth && item.isNotScheduled && styles.calendarDateWrapperNotScheduled,
                    item.isCurrentMonth && item.isCompleted && styles.calendarDateWrapperCompleted,
                    item.isCurrentMonth && item.isMissed && styles.calendarDateWrapperMissed
                  ]}>
                    <Text
                      style={[
                        styles.calendarDate,
                        !item.isCurrentMonth && styles.calendarDateFaded,
                        item.isCurrentMonth && item.isNotScheduled && styles.calendarDateTextNotScheduled,
                        item.isCurrentMonth && item.isCompleted && styles.calendarDateTextCompleted,
                        item.isCurrentMonth && item.isMissed && styles.calendarDateTextMissed
                      ]}
                    >
                      {item.day}
                    </Text>
                    {item.isCurrentMonth && item.isMissed && (
                      <View style={styles.snowflakeOverlay}>
                        <Text style={styles.snowflakeText}>❄️</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Modal Bottom Sheet for completed habits */}
        <Modal
          visible={showModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Daily Snapshot</Text>
                  <Text style={styles.modalSubTitle}>{selectedDateDisplay}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalHabitsList} showsVerticalScrollIndicator={false}>
                {selectedScheduledHabits.length === 0 && (
                  <Text style={{textAlign: 'center', color: COLORS.textMuted, marginTop: 20}}>No habits were scheduled for this day.</Text>
                )}
                {selectedScheduledHabits.map((h, i) => {
                  const done = selectedCompletedHabits.some(comp => comp.id === h.id);
                  return (
                    <View key={i} style={[styles.modalHabitRow, !done && { opacity: 0.6 }]}>
                      {done ? (
                         <MaterialIcons name="check-circle" size={24} color="#E86E3C" style={{ marginRight: 12 }} />
                      ) : (
                         <MaterialIcons name="cancel" size={24} color="#94A3B8" style={{ marginRight: 12 }} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalHabitTitle, !done && { textDecorationLine: 'line-through' }]}>{h.title}</Text>
                        <Text style={styles.modalHabitCategory}>
                           {done ? h.category : "Missed"}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

function SuccessStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.successStat}>
      <Text style={styles.successStatValue}>{value}</Text>
      <Text style={styles.successStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Success Rate card (single-habit view) ──
  successCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    gap: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  successIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E86E3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 1.5,
  },
  successHabitTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  successPercent: {
    fontSize: 32,
    fontWeight: '800',
    color: '#E86E3C',
    letterSpacing: -1,
  },
  successBarTrack: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  successBarFill: {
    height: '100%',
    backgroundColor: '#E86E3C',
    borderRadius: BORDER_RADIUS.full,
  },
  successStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  successStat: {
    flex: 1,
    alignItems: 'center',
  },
  successStatValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  successStatLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  successStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },

  // ── Best Performing Habits card (aggregate view) ──
  bestCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  bestHeader: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    marginBottom: SPACING.xs,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  bestRank: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: COLORS.textMuted,
    width: 14,
    textAlign: 'center',
  },
  bestIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestRowText: {
    flex: 1,
    gap: 5,
  },
  bestRowTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  bestRowBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  bestRowBarFill: {
    height: '100%',
    backgroundColor: '#E86E3C',
    borderRadius: BORDER_RADIUS.full,
  },
  bestRowPercent: {
    fontSize: FONT_SIZES.md,
    fontWeight: '800',
    color: '#E86E3C',
    minWidth: 42,
    textAlign: 'right',
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: -0.5,
    marginHorizontal: SPACING.sm,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl,
    paddingBottom: 120,
    gap: 28,
  },
  // Graph
  graphContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    transform: [{ rotate: '1deg' }],
    gap: SPACING.xxl,
  },
  tape: {
    position: 'absolute',
    top: -12,
    left: '50%',
    marginLeft: -48,
    width: 96,
    height: 24,
    backgroundColor: 'rgba(226,232,240,0.6)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(203,213,225,0.3)',
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  graphTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: -0.7,
    textTransform: 'uppercase',
  },
  periodButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  periodButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
    borderRadius: 2,
  },
  periodButtonActive: {
    backgroundColor: COLORS.textPrimary,
  },
  periodButtonInactive: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.7,
  },
  periodButtonText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.white,
    textTransform: 'uppercase',
  },
  periodButtonTextInactive: {
    opacity: 0.9,
  },
  chartArea: {
    height: CHART_HEIGHT + 24,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
    paddingTop: SPACING.lg,
    gap: 12,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    width: '100%',
    height: CHART_HEIGHT - 24,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  // Calendar
  calendarContainer: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 25,
    elevation: 6,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  calendarTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: '#334155',
  },
  calendarNav: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  calendarDayLabels: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  calendarDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  calendarCell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDateWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19, // perfect 50% circle
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC', // Subtle circle background for ALL unselected days
  },
  calendarDateWrapperNotScheduled: {
    backgroundColor: '#F1F5F9', // slightly richer grey
  },
  calendarDateTextNotScheduled: {
    color: '#94A3B8',
    opacity: 0.6,
  },
  calendarDateWrapperCompleted: {
    backgroundColor: '#E86E3C', // Pinkish orange color
  },
  calendarDate: {
    fontSize: FONT_SIZES.sm,
    color: '#334155',
    fontWeight: '600',
  },
  calendarDateTextCompleted: {
    color: COLORS.white,
    fontWeight: '700',
  },
  calendarDateFaded: {
    opacity: 0.3,
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
    paddingTop: SPACING.xl + 8,
    paddingBottom: 40,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: -0.5,
  },
  modalSubTitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: '500',
    marginTop: 2,
  },
  modalHabitsList: {
    marginTop: 4,
  },
  modalHabitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: '#F8F9FA',
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  modalHabitTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalHabitCategory: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '500',
    color: COLORS.textMuted,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  calendarDateWrapperMissed: {
    backgroundColor: '#E0F2FE', // Ice blue circle
    borderWidth: 1,
    borderColor: '#7DD3FC',
  },
  calendarDateTextMissed: {
    color: '#0369A1',
  },
  snowflakeOverlay: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 2,
  },
  snowflakeText: {
    fontSize: 8,
    lineHeight: 10,
  },
});
