import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import HabitDetailScreen from '../screens/HabitDetailScreen';
import StreakCelebrationScreen from '../screens/StreakCelebrationScreen';
import LegalScreen from '../screens/LegalScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import { RootStackParamList } from './types';
import { requestNotificationPermissions, rescheduleAllHabitNotifications } from '../api/notificationService';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store/store';
import { rehydrateDay, getLocalDateStr, editHabit } from '../store/habitSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useDispatch<AppDispatch>();
  const habits = useSelector((s: RootState) => s.habits.habits);
  const isLoaded = useSelector((s: RootState) => s.habits.isLoaded);

  // We always boot into Welcome. isNewUser controls whether the splash
  // routes the user to AddHabit (first launch) or straight to Tabs (returning).
  const [bootState, setBootState] = useState<{ ready: boolean; isNewUser: boolean }>({
    ready: false,
    isNewUser: false,
  });

  useEffect(() => {
    const initFirstLaunch = async () => {
      // Legacy migration: copy over the old key if present.
      let res = await AsyncStorage.getItem('@atomicstep/isLoggedIn');
      if (!res) {
        const legacy = await AsyncStorage.getItem('@habitflow/isLoggedIn');
        if (legacy) {
          await AsyncStorage.setItem('@atomicstep/isLoggedIn', legacy);
          res = legacy;
        }
      }

      // Treat the absence of the flag as "first ever launch" — the only place
      // we still distinguish new vs returning. There's no auth anymore, so we
      // set the flag immediately to avoid showing the new-user route twice.
      const isFirstLaunch = res !== 'true';
      if (isFirstLaunch) {
        await AsyncStorage.setItem('@atomicstep/isLoggedIn', 'true');
      }

      // Stamp creation date once.
      const creationDate = await AsyncStorage.getItem('@atomicstep/accountCreatedAt');
      if (!creationDate) {
        const today = new Date().toISOString().split('T')[0];
        await AsyncStorage.setItem('@atomicstep/accountCreatedAt', today);
      }

      setBootState({ ready: true, isNewUser: isFirstLaunch });
    };
    initFirstLaunch().catch(() => setBootState({ ready: true, isNewUser: false }));
  }, []);

  // Track the last-known calendar date so we can detect midnight rollovers
  const lastDateRef = useRef<string>(getLocalDateStr());

  // Detect app coming to foreground on a new calendar day → reset habits
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const today = getLocalDateStr();
        if (today !== lastDateRef.current) {
          lastDateRef.current = today;
          dispatch(rehydrateDay());
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [dispatch]);

  // Request permissions & reschedule all saved notifications after data loads.
  // Persist any newly-queued reminder IDs so they can be cancelled on completion.
  useEffect(() => {
    if (!isLoaded) return;
    requestNotificationPermissions().then(async (granted) => {
      if (!granted) return;
      try {
        const updated = await rescheduleAllHabitNotifications(habits);
        for (const h of updated) {
          dispatch(editHabit({
            id: h.id,
            updates: {
              queuedNotificationIds: h.queuedNotificationIds,
              queuedEodIds: h.queuedEodIds,
            },
          }));
        }
      } catch {
        // non-critical — reminders just won't be pre-scheduled this launch
      }
    });
  }, [isLoaded]); // Only run once after initial load

  if (!bootState.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF4EB', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF9A62" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Welcome">
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
        initialParams={{ isNewUser: bootState.isNewUser }}
      />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="HabitDetail"
        component={HabitDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="StreakCelebration"
        component={StreakCelebrationScreen}
        options={{ animation: 'fade', presentation: 'fullScreenModal' }}
      />
      <Stack.Screen
        name="Legal"
        component={LegalScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
