import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, BarChart2, Plus, Trophy } from 'lucide-react-native';
import { COLORS, SHADOWS, SPACING } from '../constants/theme';
import { useSelector } from 'react-redux';
import type { RootState } from '../store/store';

import HomeScreen from '../screens/HomeScreen';
import AddHabitScreen from '../screens/AddHabitScreen';
import InsightsScreen from '../screens/InsightsScreen';
import AchievementsScreen from '../screens/AchievementsScreen';
import { selectHasNewBadges } from '../store/habitSlice';

const Tab = createBottomTabNavigator();

export default function TabNavigator() {
  const hasHabits = useSelector((s: RootState) => s.habits.habits.length > 0);
  const hasNewBadges = useSelector(selectHasNewBadges);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => {
          if (route.name === 'AddHabit') {
            return (
              <View style={styles.fabWrap}>
                <Plus size={30} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            );
          }
          const iconColor = focused ? COLORS.textPrimary : COLORS.textMuted;
          const stroke = focused ? 2.5 : 1.8;
          if (route.name === 'Home') return <Home size={26} color={iconColor} strokeWidth={stroke} />;
          if (route.name === 'Insights') return <BarChart2 size={26} color={iconColor} strokeWidth={stroke} />;
          if (route.name === 'Achievements') {
            return (
              <View>
                <Trophy size={26} color={iconColor} strokeWidth={stroke} />
                {hasNewBadges && <View style={styles.notificationDot} />}
              </View>
            );
          }
          return null;
        },
        tabBarActiveTintColor: COLORS.textPrimary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarStyle: hasHabits ? styles.tabBar : { display: 'none' },
        tabBarShowLabel: false,
        tabBarItemStyle: styles.tabItem,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Insights" component={InsightsScreen} options={{ tabBarLabel: 'Insights' }} />
      <Tab.Screen name="AddHabit" component={AddHabitScreen} options={{ tabBarLabel: 'New' }} />
      <Tab.Screen name="Achievements" component={AchievementsScreen} options={{ tabBarLabel: 'Badges' }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 32 : 24,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 40,
    height: 72,
    borderTopWidth: 0,
    paddingHorizontal: SPACING.sm,
    ...SHADOWS.md,
  },
  tabItem: {
    paddingVertical: 10,
  },
  fabWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E86E3C',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
    shadowColor: '#E86E3C',
    shadowOpacity: 0.3,
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.accentRed,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
