import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch } from 'react-redux';
import { store, AppDispatch } from './src/store/store';
import { loadData, toggleHabit, editHabit } from './src/store/habitSlice';
import { loadSyncState } from './src/store/syncSlice';
import RootNavigator from './src/navigation/RootNavigator';
import { cancelNaggingAlarmsForDate, IS_EXPO_GO } from './src/api/notificationService';

function AppInner() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(loadData());
    // Before any edit can be recorded: the sync listener waits for this.
    dispatch(loadSyncState());

    // In Expo Go (SDK 53+) the notifications module is stripped — skip entirely.
    // In a dev build or APK this runs normally.
    if (IS_EXPO_GO) return;

    let sub: { remove: () => void } | null = null;
    try {
      // Dynamic require keeps the module from loading in Expo Go at all
      const Notifications = require('expo-notifications');
      if (!Notifications?.addNotificationResponseReceivedListener) return;

      sub = Notifications.addNotificationResponseReceivedListener(async (response: any) => {
        const { actionIdentifier, notification } = response;
        const { habitId, dateStr } = notification.request.content.data;

        if (!habitId) return;

        if (actionIdentifier === 'COMPLETE') {
          dispatch(toggleHabit(habitId));
          const habit = store.getState().habits.habits.find((h: any) => h.id === habitId);
          if (habit && dateStr) {
            const updated = await cancelNaggingAlarmsForDate(habit, dateStr);
            dispatch(editHabit({ id: habitId, updates: { queuedNotificationIds: updated.queuedNotificationIds } }));
          }
        } else if (actionIdentifier === 'SNOOZE') {
          const snoozeDate = new Date(Date.now() + 10 * 60 * 1000);
          const snoozeTrigger: any = {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: snoozeDate,
          };
          if (require('react-native').Platform.OS === 'android') {
            snoozeTrigger.channelId = 'habit-reminders';
          }
          Notifications.scheduleNotificationAsync({
            content: { ...notification.request.content, body: 'Snoozed! Check back in 10 minutes.' },
            trigger: snoozeTrigger,
          });
        }
      });
    } catch (e) {
      console.warn('[Notifications] Listener setup failed:', e);
    }

    return () => { sub?.remove(); };
  }, [dispatch]);

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <AppInner />
      </SafeAreaProvider>
    </Provider>
  );
}
