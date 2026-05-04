export type RootStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  Welcome: { isNewUser: boolean };
  Tabs: { screen?: string; params?: Record<string, any> } | undefined;
  HabitDetail: { habitId: string };
  StreakCelebration: {
    streak: number;
    status: 'maintained' | 'broken';
    weeklyProgress: boolean[];
    triggerType: 'allComplete' | 'noneComplete' | 'none';
    scheduledCount: number;
    completedCount: number;
  };
  Legal: { type: 'terms' | 'privacy' };
};

export type TabParamList = {
  Home: { justCompletedId?: string } | undefined;
  Insights: { habitId?: string } | undefined;
  AddHabit: undefined;
  Achievements: undefined;
};
