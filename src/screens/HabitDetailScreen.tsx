import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { useHabitStore } from '../store/habitStore';
import { CATEGORY_CONFIG, HabitCategory, Habit } from '../types';
import { getLocalDateStr } from '../store/habitSlice';
import { computeHabitStats, formatRate } from '../utils/habitStats';

const CHART_HEIGHT = 140;
const DAYS_OF_WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS_FULL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_LABELS_CHART = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ChartDataState = 'completed' | 'missed' | 'not_scheduled' | 'future';

function computeHabitChartData(habit: Habit, accountCreatedAt: string | null): { label: string; state: ChartDataState }[] {
  const today = new Date();
  today.setHours(0,0,0,0);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (6 - i));
    
    // Exact copy of today logic to ensure accurate future parsing
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0,0,0,0);

    const dateStr = getLocalDateStr(date);
    const dayOfWeek = date.getDay() === 0 ? 6 : date.getDay() - 1;
    
    if (normalizedDate > today) return { label: DAY_LABELS_CHART[dayOfWeek], state: 'future' };

    // Neutrality Check: If before account creation or habit creation, treat as not scheduled/neutral
    if ((accountCreatedAt && dateStr < accountCreatedAt) || (dateStr < habit.createdAt)) {
      return { label: DAY_LABELS_CHART[dayOfWeek], state: 'not_scheduled' };
    }

    if (!habit.frequency[dayOfWeek]) return { label: DAY_LABELS_CHART[dayOfWeek], state: 'not_scheduled' };
    if (habit.completionLog[dateStr]) return { label: DAY_LABELS_CHART[dayOfWeek], state: 'completed' };
    return { label: DAY_LABELS_CHART[dayOfWeek], state: 'missed' };
  });
}

export default function HabitDetailScreen({ route, navigation }: any) {
  const { habitId } = route.params;
  const { habits, toggleHabit, deleteHabit, editHabit, setAlarms } = useHabitStore();
  const habit = habits.find((h) => h.id === habitId);
  const [accountCreatedAt, setAccountCreatedAt] = useState<string | null>(null);

  React.useEffect(() => {
    const fetchMeta = async () => {
      const created = await AsyncStorage.getItem('@atomicstep/accountCreatedAt');
      setAccountCreatedAt(created);
    };
    fetchMeta();
  }, []);

  const chartData = useMemo(() => (habit ? computeHabitChartData(habit, accountCreatedAt) : []), [habit, accountCreatedAt]);
  const habitStats = useMemo(() => (habit ? computeHabitStats(habit, accountCreatedAt) : null), [habit, accountCreatedAt]);

  // Modals state
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showDailySnapshotModal, setShowDailySnapshotModal] = useState(false);

  // Snapshot modal selected date
  const [selectedCompletedHabits, setSelectedCompletedHabits] = useState<Habit[]>([]);
  const [selectedScheduledHabits, setSelectedScheduledHabits] = useState<Habit[]>([]);
  const [selectedDateDisplay, setSelectedDateDisplay] = useState<string>('');

  // Calendar State
  const [currentMonthModifier, setCurrentMonthModifier] = useState(0);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDays, setEditDays] = useState<boolean[]>([]);
  const [reminderHour, setReminderHour] = useState('08');
  const [reminderMinute, setReminderMinute] = useState('00');

  if (!habit) {
    return (
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        style={styles.container}
      >
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.editButton}>
              <MaterialIcons name="more-horiz" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>This habit no longer exists.</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const config = CATEGORY_CONFIG[habit.category];

  const handleMarkDone = () => {
    toggleHabit(habitId);
    navigation.navigate('Tabs', {
      screen: 'Home',
      params: { justCompletedId: habit.completedToday ? undefined : habitId },
    });
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Habit',
      `Are you sure you want to delete "${habit.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteHabit(habitId);
            navigation.goBack();
          },
        },
      ]
    );
  };

  const openEditModal = () => {
    setEditTitle(habit.title);
    setEditDescription(habit.description || '');
    setEditDays([...habit.frequency]);
    setShowEditModal(true);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim()) {
      Alert.alert('Error', 'Habit name cannot be empty.');
      return;
    }
    editHabit(habitId, {
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
      frequency: editDays,
      targetDaysPerWeek: editDays.filter(Boolean).length,
    });
    setShowEditModal(false);
  };

  // ── Multiple Alarms helpers ──────────────────────────────────────────────────────
  const openReminderModal = () => {
    setReminderHour('08');
    setReminderMinute('00');
    setShowReminderModal(true);
  };

  const handleSaveReminder = async () => {
    const h = Math.min(23, Math.max(0, parseInt(reminderHour, 10) || 0));
    const m = Math.min(59, Math.max(0, parseInt(reminderMinute, 10) || 0));
    const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    
    // Check if modifying notificationTime or alarms array
    const currentAlarms = habit.alarms || (habit.notificationTime ? [habit.notificationTime] : []);
    if (!currentAlarms.includes(timeStr)) {
      await setAlarms(habitId, [...currentAlarms, timeStr].sort());
    }
    setShowReminderModal(false);
  };

  const handleClearAlarm = (timeStr: string) => {
    Alert.alert(
      'Remove Alarm',
      `Delete the ${formatDisplayTime(timeStr)} alarm for this habit?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const currentAlarms = habit.alarms || (habit.notificationTime ? [habit.notificationTime] : []);
            const newAlarms = currentAlarms.filter(a => a !== timeStr);
            await setAlarms(habitId, newAlarms);
          },
        },
      ],
    );
  };

  const formatDisplayTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  // Calendar data
  const calendarDateContext = new Date();
  calendarDateContext.setMonth(calendarDateContext.getMonth() + currentMonthModifier);
  const monthName = calendarDateContext.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstDay = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth(), 1);
  const startDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth() + 1, 0).getDate();
  const daysInPrevMonth = new Date(calendarDateContext.getFullYear(), calendarDateContext.getMonth(), 0).getDate();

  const calendarDays: { day: number; isCurrentMonth: boolean; isCompleted: boolean; isMissed: boolean; isNotScheduled: boolean; dateStr?: string; completedHabits: Habit[]; scheduledHabits: Habit[] }[] = [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    calendarDays.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isCompleted: false, isMissed: false, isNotScheduled: false, completedHabits: [], scheduledHabits: [] });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${calendarDateContext.getFullYear()}-${String(calendarDateContext.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
    
    // Find scheduled habits
    const scheduledOnThisDate = habit.frequency[dayOfWeek] ? [habit] : [];
    const completedOnThisDate = habit.completionLog[dateStr] ? [habit] : [];
    
    const isCompleted = completedOnThisDate.length > 0;
    const isNotScheduled = scheduledOnThisDate.length === 0;
    
    // Missed? (past or today, scheduled but none completed)
    let isMissed = false;
    if (dateObj <= today && !isCompleted && !isNotScheduled) {
      // Only missed if it's on or after account creation AND habit creation date
      const isRecordExists = (!accountCreatedAt || dateStr >= accountCreatedAt) && (dateStr >= habit.createdAt);
      if (isRecordExists) {
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
      completedHabits: completedOnThisDate, 
      scheduledHabits: scheduledOnThisDate 
    });
  }

  const handleDatePress = (item: typeof calendarDays[0]) => {
    if (!item.isCurrentMonth) return;
    setSelectedCompletedHabits(item.completedHabits);
    setSelectedScheduledHabits(item.scheduledHabits);
    const dateObj = new Date(item.dateStr!);
    setSelectedDateDisplay(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
    setShowDailySnapshotModal(true);
  };

  return (
    <LinearGradient
      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
      style={styles.container}
    >
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <MaterialIcons name="arrow-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{habit.title}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={openEditModal} style={styles.headerBtn}>
              <MaterialIcons name="edit" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
              <MaterialIcons name="delete-outline" size={20} color={COLORS.accentRed} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Habit Info Card */}
          <View style={[styles.infoCard, { backgroundColor: config.stickyColor }]}>
            <View style={styles.infoCardHeader}>
              <View style={[styles.categoryDot, { backgroundColor: config.accentColor }]} />
              <Text style={[styles.categoryText, { color: config.accentColor }]}>
                {config.label}
              </Text>
            </View>
            <Text style={styles.infoTitle}>{habit.title}</Text>
            {habit.description ? (
              <Text style={styles.infoDesc}>{habit.description}</Text>
            ) : null}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <MaterialIcons name="local-fire-department" size={18} color="#F97316" />
                <Text style={styles.statValue}>{habit.currentStreak}</Text>
                <Text style={styles.statLabel}>Current</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialIcons name="whatshot" size={18} color="#EF4444" />
                <Text style={styles.statValue}>{habit.longestStreak}</Text>
                <Text style={styles.statLabel}>Best</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialIcons name="calendar-today" size={18} color={COLORS.accentBlue} />
                <Text style={styles.statValue}>{habit.targetDaysPerWeek}</Text>
                <Text style={styles.statLabel}>days/wk</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialIcons name="insights" size={18} color="#10B981" />
                <Text style={styles.statValue}>{habitStats ? formatRate(habitStats.successRate) : '—'}</Text>
                <Text style={styles.statLabel}>Success</Text>
              </View>
            </View>
          </View>

          {/* Mark as Done Button */}
          <TouchableOpacity
            style={[
              styles.markDoneButton,
              habit.completedToday && styles.markDoneButtonCompleted,
            ]}
            onPress={handleMarkDone}
            activeOpacity={0.8}
          >
            <View style={styles.markDoneRadio}>
              <View
                style={[
                  styles.markDoneInner,
                  habit.completedToday && { backgroundColor: '#22C55E' },
                ]}
              />
            </View>
            <Text style={styles.markDoneText}>
              {habit.completedToday ? 'Completed! Tap to undo' : 'Mark as Done'}
            </Text>
          </TouchableOpacity>

          {/* ── Set Alarms Card ── */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderCardLeft}>
              <View style={styles.reminderIconWrap}>
                <Text style={styles.reminderIconEmoji}>⏰</Text>
              </View>
              <View>
                <Text style={styles.reminderCardTitle}>In-App Alarms</Text>
                <Text style={styles.reminderCardSub}>
                  {(habit.alarms?.length || habit.notificationTime) ? 'Daily smart nagging' : 'No alarms set'}
                </Text>
              </View>
            </View>
            <View style={styles.reminderCardActions}>
              <TouchableOpacity
                style={styles.reminderActionBtn}
                onPress={openReminderModal}
                activeOpacity={0.75}
              >
                <Text style={styles.reminderActionBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Render individual preset alarm pills */}
          {((habit.alarms && habit.alarms.length > 0) || habit.notificationTime) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginBottom: 16 }}>
              {(habit.alarms || (habit.notificationTime ? [habit.notificationTime] : [])).map((t, idx) => (
                 <View key={idx} style={{ backgroundColor: '#DBEAFE', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center' }}>
                   <Text style={{ fontSize: 13, fontWeight: '600', color: '#1E3A8A', marginRight: 6 }}>{formatDisplayTime(t)}</Text>
                   <TouchableOpacity onPress={() => handleClearAlarm(t)}>
                     <MaterialIcons name="close" size={16} color="#1E3A8A" />
                   </TouchableOpacity>
                 </View>
              ))}
            </View>
          )}

          {/* Consistency Graph */}
          <View style={styles.graphContainer}>
            <View style={styles.tape} />
            <View style={styles.graphHeader}>
              <View>
                <Text style={styles.graphTitle}>CONSISTENCY</Text>
                <Text style={styles.graphTitle}>GRAPH</Text>
              </View>
            </View>
            <View style={styles.chartArea}>
              <View style={styles.barsContainer}>
                {chartData.map((bar, index) => {
                  let height = '0%';
                  let color = 'transparent';
                  
                  if (bar.state === 'completed') {
                    height = '100%';
                    color = config.accentColor; // Full specific category color
                  } else if (bar.state === 'missed') {
                    height = '40%';
                    color = '#E0F2FE'; // Icy blue
                  } else if (bar.state === 'not_scheduled') {
                    height = '15%';
                    color = '#F1F5F9'; // Inactive grey
                  } else if (bar.state === 'future') {
                    height = '8%';
                    color = '#F8FAFC'; // Subtle fallback
                  }

                  return (
                    <View key={index} style={styles.barColumn}>
                      <View style={styles.barWrapper}>
                        <View
                          style={[
                            styles.bar,
                            { height: height as any, backgroundColor: color }
                          ]}
                        />
                      </View>
                      <Text style={styles.barLabel}>{bar.label}</Text>
                    </View>
                  );
                })}
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
            <View style={styles.calendarDayLabels}>
              {DAYS_OF_WEEK.map((day, i) => (
                <Text key={i} style={styles.calendarDayLabel}>{day}</Text>
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

        {/* ── Daily Snapshot Modal ── */}
        <Modal
          visible={showDailySnapshotModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDailySnapshotModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Daily Snapshot</Text>
                  <Text style={styles.modalSubTitle}>{selectedDateDisplay}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowDailySnapshotModal(false)}>
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

        {/* ── Reminder Time-Picker Modal ── */}
        <Modal visible={showReminderModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Set Daily Reminder</Text>
                <TouchableOpacity onPress={() => setShowReminderModal(false)}>
                  <Text style={{ fontSize: 22, color: '#94A3B8' }}>✕</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.reminderModalDesc}>
                Choose a time to receive a daily nudge for this habit.
              </Text>

              {/* Time input row */}
              <View style={styles.timePickerRow}>
                <View style={styles.timeInputBox}>
                  <TextInput
                    style={styles.timeInputField}
                    value={reminderHour}
                    onChangeText={(v) => {
                      const n = v.replace(/[^0-9]/g, '').slice(0, 2);
                      setReminderHour(n);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="08"
                    placeholderTextColor="#CBD5E1"
                    selectTextOnFocus
                  />
                  <Text style={styles.timeInputLabel}>HOUR</Text>
                </View>

                <Text style={styles.timeColon}>:</Text>

                <View style={styles.timeInputBox}>
                  <TextInput
                    style={styles.timeInputField}
                    value={reminderMinute}
                    onChangeText={(v) => {
                      const n = v.replace(/[^0-9]/g, '').slice(0, 2);
                      setReminderMinute(n);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="00"
                    placeholderTextColor="#CBD5E1"
                    selectTextOnFocus
                  />
                  <Text style={styles.timeInputLabel}>MIN</Text>
                </View>
              </View>

              {/* Quick presets */}
              <Text style={styles.presetsLabel}>Quick Presets</Text>
              <View style={styles.presetsRow}>
                {[['06:00', '6 AM'], ['08:00', '8 AM'], ['12:00', '12 PM'], ['18:00', '6 PM'], ['21:00', '9 PM']].map(
                  ([val, label]) => (
                    <TouchableOpacity
                      key={val}
                      style={[
                        styles.presetChip,
                        reminderHour + ':' + reminderMinute === val && styles.presetChipActive,
                      ]}
                      onPress={() => {
                        const [h, m] = val.split(':');
                        setReminderHour(h);
                        setReminderMinute(m);
                      }}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          reminderHour + ':' + reminderMinute === val && styles.presetChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ),
                )}
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveReminder}>
                <Text style={styles.saveButtonText}>Save Reminder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Edit Modal */}
        <Modal visible={showEditModal} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Habit</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <MaterialIcons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>HABIT NAME</Text>
                  <TextInput
                    style={styles.textInput}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Habit name"
                    placeholderTextColor={COLORS.textPlaceholder}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>DESCRIPTION</Text>
                  <TextInput
                    style={[styles.textInput, styles.textArea]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Optional description"
                    placeholderTextColor={COLORS.textPlaceholder}
                    multiline
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>FREQUENCY</Text>
                  <View style={styles.daysRow}>
                    {DAY_LABELS_FULL.map((day, index) => (
                      <TouchableOpacity
                        key={index}
                        onPress={() => {
                          const newDays = [...editDays];
                          newDays[index] = !newDays[index];
                          setEditDays(newDays);
                        }}
                        style={styles.dayColumn}
                      >
                        <Text style={styles.dayLabel}>{day}</Text>
                        <View
                          style={[
                            styles.dayCircle,
                            editDays[index] && styles.dayCircleSelected,
                          ]}
                        >
                          {editDays[index] && (
                            <MaterialIcons name="check" size={14} color={COLORS.accentOrange} />
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={handleSaveEdit}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    backgroundColor: 'transparent',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    padding: 4,
  },
  editButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginHorizontal: SPACING.sm,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl,
    paddingBottom: 120,
    gap: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
  },
  // Info Card
  infoCard: {
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.xl,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  infoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoTitle: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  infoDesc: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: SPACING.md,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  // Mark Done
  markDoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.accentRedDark,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.lg,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 6,
  },
  markDoneButtonCompleted: {
    backgroundColor: '#16A34A',
  },
  markDoneRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDoneInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentRedDark,
  },
  markDoneText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
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
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  calendarDateTextMissed: {
    color: '#0369A1',
  },
  calendarDateFaded: {
    opacity: 0.3,
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
  calendarDateWrapperMissed: {
    backgroundColor: '#E0F2FE', // Ice blue circle
    borderWidth: 1,
    borderColor: '#7DD3FC',
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
  // Modal standard styles
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
  // Edit Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: SPACING.xxl,
    borderTopRightRadius: SPACING.xxl,
    paddingHorizontal: SPACING.xxl,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalBody: {
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
    fontSize: FONT_SIZES.lg,
    fontWeight: '500',
    color: COLORS.textPrimary,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  textArea: {
    minHeight: 48,
    textAlignVertical: 'top',
  },
  daysRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  dayColumn: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    height: 28,
    lineHeight: 28,
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
  saveButton: {
    backgroundColor: COLORS.accentGreen,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING.xxl,
  },
  saveButtonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.white,
  },

  // ── Reminder Card ────────────────────────────────────────────────────────
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFDF7',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  reminderCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  reminderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderIconEmoji: {
    fontSize: 20,
  },
  reminderCardTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#1E293B',
  },
  reminderCardSub: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  reminderCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reminderActionBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  reminderActionBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  reminderClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderClearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },

  // ── Reminder Modal ───────────────────────────────────────────────────────
  reminderModalDesc: {
    fontSize: FONT_SIZES.md,
    color: '#64748B',
    marginBottom: SPACING.xxl,
    lineHeight: 22,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.xxl,
  },
  timeInputBox: {
    alignItems: 'center',
    gap: 4,
  },
  timeInputField: {
    width: 90,
    height: 70,
    backgroundColor: '#F8FAFC',
    borderRadius: BORDER_RADIUS.lg,
    fontSize: 36,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  timeInputLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  timeColon: {
    fontSize: 36,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 20,
  },
  presetsLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: SPACING.md,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  presetChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: '#F1F5F9',
  },
  presetChipActive: {
    backgroundColor: '#FEF3C7',
  },
  presetChipText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#64748B',
  },
  presetChipTextActive: {
    color: '#B45309',
    fontWeight: '700',
  },
});
