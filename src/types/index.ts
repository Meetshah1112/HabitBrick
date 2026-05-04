export type HabitCategory =
  | 'physical'
  | 'academics'
  | 'health'
  | 'mindfulness'
  | 'creativity'
  | 'social'
  | 'finance'
  | 'productivity'
  | 'nutrition'
  | 'sleep'
  | 'hobbies'
  | 'selfcare'
  | 'language'
  | 'cooking'
  | 'music'
  | 'reading'
  | 'travel'
  | 'volunteering'
  | 'pets'
  | 'cleaning'
  | 'gardening'
  | 'coding';

export interface Habit {
  id: string;
  title: string;
  description?: string;
  category: HabitCategory;
  frequency: boolean[]; // [M, T, W, T, F, S, S]
  targetDaysPerWeek: number;
  currentStreak: number;
  longestStreak: number;
  completedToday: boolean;
  completionLog: Record<string, boolean | string>; // date string -> completed (boolean) or ISO timestamp (string)
  createdAt: string;
  notificationTime?: string; // deprecated, use alarms instead
  alarms?: string[]; // Array of times like ["08:00", "12:00"]
  queuedNotificationIds?: Record<string, string[]>; // dateStr -> notification identifiers
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  requirement: string;
  streakRequired: number;
  isNewUnlock?: boolean;
}

export const CATEGORY_CONFIG: Record<HabitCategory, {
  color: string;
  borderColor: string;
  textColor: string;
  icon: string;
  label: string;
  stickyColor: string;
  accentColor: string;
  placeholder: string;
  whyReason: string;
}> = {
  physical: {
    color: '#DCFCE7',
    borderColor: '#BBF7D0',
    textColor: '#14532D',
    icon: 'fitness-center',
    label: 'Physical Activity',
    stickyColor: '#D5EBB9',
    accentColor: '#059669',
    placeholder: 'e.g., Go for a 30m run',
    whyReason: 'Regular physical activity strengthens your heart, muscles, and bones, and boosts your mood.',
  },
  academics: {
    color: '#FFEDD5',
    borderColor: '#FED7AA',
    textColor: '#7C2D12',
    icon: 'school',
    label: 'Academics',
    stickyColor: '#E9E5B5',
    accentColor: '#D97706',
    placeholder: 'e.g., Study Math for 1 hour',
    whyReason: 'Continuous learning expands your knowledge base and opens up new opportunities.',
  },
  health: {
    color: '#DBEAFE',
    borderColor: '#BFDBFE',
    textColor: '#1E3A8A',
    icon: 'favorite',
    label: 'Health',
    stickyColor: '#D6E2ED',
    accentColor: '#3B82F6',
    placeholder: 'e.g., Drink 8 glasses of water',
    whyReason: 'Taking care of your health prevents illness and keeps your energy levels high throughout the day.',
  },
  mindfulness: {
    color: '#FCE7F3',
    borderColor: '#FBCFE8',
    textColor: '#831843',
    icon: 'self-improvement',
    label: 'Mindfulness',
    stickyColor: '#EABDD1',
    accentColor: '#A855F7',
    placeholder: 'e.g., Meditate for 10 mins',
    whyReason: 'Mindfulness reduces stress, improves focus, and fosters emotional resilience.',
  },
  creativity: {
    color: '#F0E6FF',
    borderColor: '#DDD6FE',
    textColor: '#581C87',
    icon: 'brush',
    label: 'Creativity',
    stickyColor: '#CBB2E9',
    accentColor: '#9333EA',
    placeholder: 'e.g., Draw a sketch',
    whyReason: 'Creative expression helps problem-solving and acts as a great outlet for your emotions.',
  },
  social: {
    color: '#FFF1E6',
    borderColor: '#FDDCB5',
    textColor: '#7C2D12',
    icon: 'people',
    label: 'Social',
    stickyColor: '#FDF1AF',
    accentColor: '#EA580C',
    placeholder: 'e.g., Call a friend',
    whyReason: 'Strong social ties are consistently linked to a longer, happier, and healthier life.',
  },
  finance: {
    color: '#ECFDF5',
    borderColor: '#A7F3D0',
    textColor: '#064E3B',
    icon: 'account-balance-wallet',
    label: 'Finance',
    stickyColor: '#C4F6C1', // distinct green tone
    accentColor: '#047857',
    placeholder: 'e.g., Track daily expenses',
    whyReason: 'Financial awareness brings peace of mind and builds a secure foundation for your future.',
  },
  productivity: {
    color: '#FEF3C7',
    borderColor: '#FDE68A',
    textColor: '#713F12',
    icon: 'rocket-launch',
    label: 'Productivity',
    stickyColor: '#FDE08A',
    accentColor: '#B45309',
    placeholder: 'e.g., Plan tomorrow’s tasks',
    whyReason: 'Being productive means working smarter, giving you more time for things you truly enjoy.',
  },
  nutrition: {
    color: '#FFF5F5',
    borderColor: '#FECACA',
    textColor: '#881337',
    icon: 'restaurant',
    label: 'Nutrition',
    stickyColor: '#FBB3B3',
    accentColor: '#E11D48',
    placeholder: 'e.g., Eat a piece of fruit',
    whyReason: 'Good nutrition fuels your body and mind, enhancing your overall well-being.',
  },
  sleep: {
    color: '#E0E7FF',
    borderColor: '#C7D2FE',
    textColor: '#312E81',
    icon: 'bedtime',
    label: 'Sleep',
    stickyColor: '#B5C4FA',
    accentColor: '#4F46E5',
    placeholder: 'e.g., Sleep by 11 PM',
    whyReason: 'Quality sleep is essential for physical recovery, memory consolidation, and mental clarity.',
  },
  hobbies: {
    color: '#CCFBF1',
    borderColor: '#99F6E4',
    textColor: '#134E4A',
    icon: 'palette',
    label: 'Hobbies',
    stickyColor: '#96EEDB',
    accentColor: '#0D9488',
    placeholder: 'e.g., Play video games for 1 hr',
    whyReason: 'Hobbies provide a healthy escape from daily routines and spark joy.',
  },
  selfcare: {
    color: '#FDF2F8',
    borderColor: '#FBCFE8',
    textColor: '#701A75',
    icon: 'spa',
    label: 'Self Care',
    stickyColor: '#F5A9D3',
    accentColor: '#C026D3',
    placeholder: 'e.g., Do a skincare routine',
    whyReason: 'Self-care ensures you are replenishing your energy so you can show up fully in life.',
  },
  language: {
    color: '#E0F2FE',
    borderColor: '#BAE6FD',
    textColor: '#0369A1',
    icon: 'language',
    label: 'Language',
    stickyColor: '#AEE1FF',
    accentColor: '#0284C7',
    placeholder: 'e.g., Practice Spanish on Duolingo',
    whyReason: 'Learning a language improves memory, boosts brain power, and connects you to new cultures.',
  },
  cooking: {
    color: '#FFEDD5',
    borderColor: '#FED7AA',
    textColor: '#C2410C',
    icon: 'restaurant-menu',
    label: 'Cooking',
    stickyColor: '#FCD19C',
    accentColor: '#EA580C',
    placeholder: 'e.g., Cook a new healthy recipe',
    whyReason: 'Cooking at home is healthier, saves money, and is a wonderful creative outlet.',
  },
  music: {
    color: '#EDE9FE',
    borderColor: '#DDD6FE',
    textColor: '#6D28D9',
    icon: 'music-note',
    label: 'Music',
    stickyColor: '#D2C1FA',
    accentColor: '#7C3AED',
    placeholder: 'e.g., Practice guitar for 20 mins',
    whyReason: 'Playing music enhances cognitive function and is a powerful way to process emotions.',
  },
  reading: {
    color: '#F3F4F6',
    borderColor: '#E5E7EB',
    textColor: '#374151',
    icon: 'menu-book',
    label: 'Reading',
    stickyColor: '#E2E8F0',
    accentColor: '#4B5563',
    placeholder: 'e.g., Read 10 pages of a book',
    whyReason: 'Reading stimulates your mind, expands your vocabulary, and reduces stress.',
  },
  travel: {
    color: '#ECFEFF',
    borderColor: '#CFFAFE',
    textColor: '#0F766E',
    icon: 'flight',
    label: 'Travel',
    stickyColor: '#B5F5F9',
    accentColor: '#0D9488',
    placeholder: 'e.g., Research a new destination',
    whyReason: 'Exploring new places broadens your perspective and builds unforgettable memories.',
  },
  volunteering: {
    color: '#FFE4E6',
    borderColor: '#FECDD3',
    textColor: '#BE123C',
    icon: 'volunteer-activism',
    label: 'Volunteering',
    stickyColor: '#FDB6C4',
    accentColor: '#E11D48',
    placeholder: 'e.g., Help out at a local shelter',
    whyReason: 'Giving back to the community increases your own happiness and creates a sense of purpose.',
  },
  pets: {
    color: '#FEF08A',
    borderColor: '#FDE047',
    textColor: '#854D0E',
    icon: 'pets',
    label: 'Pets',
    stickyColor: '#FCEB6A',
    accentColor: '#CA8A04',
    placeholder: 'e.g., Walk the dog',
    whyReason: 'Caring for pets provides companionship and encourages routine and physical activity.',
  },
  cleaning: {
    color: '#F0FDF4',
    borderColor: '#BBF7D0',
    textColor: '#15803D',
    icon: 'cleaning-services',
    label: 'Cleaning',
    stickyColor: '#C4F6D4',
    accentColor: '#16A34A',
    placeholder: 'e.g., Tidy desk for 5 mins',
    whyReason: 'A clean environment reduces anxiety and helps you maintain focus and productivity.',
  },
  gardening: {
    color: '#D1FAE5',
    borderColor: '#A7F3D0',
    textColor: '#047857',
    icon: 'grass',
    label: 'Gardening',
    stickyColor: '#A0F1CD',
    accentColor: '#059669',
    placeholder: 'e.g., Water the indoor plants',
    whyReason: 'Gardening connects you with nature and is a great way to practice patience and care.',
  },
  coding: {
    color: '#E2E8F0',
    borderColor: '#CBD5E1',
    textColor: '#0F172A',
    icon: 'code',
    label: 'Coding',
    stickyColor: '#CBD5E1',
    accentColor: '#334155',
    placeholder: 'e.g., Solve 1 LeetCode problem',
    whyReason: 'Coding builds logical thinking, problem-solving skills, and empowers you to build the future.',
  },
};

