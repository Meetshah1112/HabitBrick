import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import TabNavigator from './TabNavigator';
import HabitDetailScreen from '../screens/HabitDetailScreen';
import StreakCelebrationScreen from '../screens/StreakCelebrationScreen';
import LegalScreen from '../screens/LegalScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import { RootStackParamList } from './types';
import { requestNotificationPermissions, rescheduleAllHabitNotifications } from '../api/notificationService';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../store/store';
import { rehydrateDay, getLocalDateStr } from '../store/habitSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useDispatch<AppDispatch>();
  const habits = useSelector((s: RootState) => s.habits.habits);
  const isLoaded = useSelector((s: RootState) => s.habits.isLoaded);

  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    const checkLogin = async () => {
      let res = await AsyncStorage.getItem('@atomicstep/isLoggedIn');
      if (!res) {
        res = await AsyncStorage.getItem('@habitflow/isLoggedIn');
        if (res) await AsyncStorage.setItem('@atomicstep/isLoggedIn', res);
      }

      // Migration: Set creation date if missing
      const creationDate = await AsyncStorage.getItem('@atomicstep/accountCreatedAt');
      if (!creationDate) {
        const today = new Date().toISOString().split('T')[0];
        await AsyncStorage.setItem('@atomicstep/accountCreatedAt', today);
      }

      setInitialRoute(res === 'true' ? 'Welcome' : 'SignIn');
    };
    checkLogin().catch(() => setInitialRoute('SignIn'));
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

  // Request permissions & reschedule all saved notifications after data loads
  useEffect(() => {
    if (!isLoaded) return;
    requestNotificationPermissions().then((granted) => {
      if (granted) {
        rescheduleAllHabitNotifications(habits).catch(() => {});
      }
    });
  }, [isLoaded]); // Only run once after initial load

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: '#FFF4EB', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FF9A62" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
      <Stack.Screen name="SignIn" component={SignInScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
        initialParams={{ isNewUser: false }}
      />
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
