import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TabNavigator from './TabNavigator';
import HabitDetailScreen from '../screens/HabitDetailScreen';
import StreakCelebrationScreen from '../screens/StreakCelebrationScreen';
import LegalScreen from '../screens/LegalScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import { RootStackParamList } from './types';
import { requestNotificationPermissions, rescheduleAllHabitNotifications } from '../api/notificationService';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store/store';
import { rehydrateDay, getLocalDateStr, editHabit } from '../store/habitSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeLegacyCredentials } from '../api/legacyCredentialPurge';
import { onAuthStateChange } from '../api/authService';
import { startAuthAutoRefresh } from '../lib/supabase';
import { initAuth, authUserChanged, fetchProfile } from '../store/authSlice';
import { refreshBackupStatus, backUpNow } from '../store/backupSlice';
import CloudBackupScreen from '../screens/CloudBackupScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useDispatch<AppDispatch>();
  const habits = useSelector((s: RootState) => s.habits.habits);
  const isLoaded = useSelector((s: RootState) => s.habits.isLoaded);
  const authStatus = useSelector((s: RootState) => s.auth.status);
  const userId = useSelector((s: RootState) => s.auth.userId);
  const backupStatus = useSelector((s: RootState) => s.backup.status);

  // We always boot into Welcome. isNewUser controls whether the splash
  // routes the user to AddHabit (first launch) or straight to Tabs (returning).
  const [bootState, setBootState] = useState<{ ready: boolean; isNewUser: boolean }>({
    ready: false,
    isNewUser: false,
  });

  useEffect(() => {
    const initFirstLaunch = async () => {
      // Security: remove plaintext passwords left by the old local "auth".
      // Must not block boot; it is idempotent and simply retries next launch.
      await purgeLegacyCredentials().catch((e) => {
        if (__DEV__) console.warn('[boot] legacy credential purge failed', e);
      });

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

  // Optional cloud account. Deliberately NOT part of bootState: the app is
  // local-first and must never wait on an account the user may never create.
  // With no stored session none of this makes a network request.
  useEffect(() => {
    dispatch(initAuth());
    const unsubscribe = onAuthStateChange((userId) => {
      dispatch(authUserChanged(userId));
    });
    const stopRefresh = startAuthAutoRefresh();
    return () => {
      unsubscribe();
      stopRefresh();
    };
  }, [dispatch]);

  useEffect(() => {
    if (authStatus === 'signedIn') dispatch(fetchProfile());
  }, [authStatus, dispatch]);

  // Backup (Phase 3). Waits for isLoaded: evaluating against the not-yet-
  // loaded empty list would silently claim the device with nothing in it.
  // Only RESUMES an upload the user already consented to; the first upload
  // is always started from the consent screen, never from here.
  useEffect(() => {
    if (authStatus !== 'signedIn' || !userId || !isLoaded) return;
    dispatch(refreshBackupStatus(userId)).then((action) => {
      const payload = refreshBackupStatus.fulfilled.match(action) ? action.payload : null;
      if (payload?.decision === 'resumeUpload') dispatch(backUpNow({ consent: false }));
    });
  }, [authStatus, userId, isLoaded, dispatch]);

  // A backup that failed (usually no connection) retries when the user
  // comes back to the app, rather than on a background timer.
  useEffect(() => {
    if (backupStatus !== 'failed') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') dispatch(backUpNow({ consent: false }));
    });
    return () => sub.remove();
  }, [backupStatus, dispatch]);

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
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
      <Stack.Screen
        name="CloudBackup"
        component={CloudBackupScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
