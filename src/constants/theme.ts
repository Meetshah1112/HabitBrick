export const COLORS = {
  background: '#F8F9FA',
  white: '#FFFFFF',
  black: '#000000',

  // Text colors
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#64748B',
  textMuted: '#94A3B8',
  textPlaceholder: '#CBD5E1',

  // Sticky note colors by category (soft pastel paper tone)
  stickyYellow: '#E9E5B5',
  stickyGreen: '#D5EBB9',
  stickyBlue: '#D6E2ED',
  stickyPink: '#EABDD1',
  stickyPurple: '#CBB2E9',
  stickyOrange: '#FDF1AF',

  // Main gradient (warm soft paper beige)
  gradientStart: '#F1ECE2',
  gradientEnd: '#E4DFD5',

  // Category card colors
  categoryGreen: '#DCFCE7',
  categoryGreenBorder: '#BBF7D0',
  categoryGreenText: '#14532D',
  categoryOrange: '#FFEDD5',
  categoryOrangeBorder: '#FED7AA',
  categoryOrangeText: '#7C2D12',
  categoryBlue: '#DBEAFE',
  categoryBlueBorder: '#BFDBFE',
  categoryBlueText: '#1E3A8A',
  categoryPink: '#FCE7F3',
  categoryPinkBorder: '#FBCFE8',
  categoryPinkText: '#831843',

  // Accent colors
  accentGreen: '#19E65E',
  accentGreenLight: 'rgba(25,230,94,0.1)',
  accentBlue: '#3B82F6',
  accentPurple: '#A855F7',
  accentRed: '#EF4444',
  accentRedDark: '#DC2626',
  accentOrange: '#EC5B13',

  // Status colors
  statusDone: '#64748B',
  statusTodo: '#059669',

  // Border / Surface
  border: '#E2E8F0',
  borderLight: 'rgba(255,255,255,0.3)',
  surface: '#F8FAFC',
  surfaceOverlay: 'rgba(246,248,246,0.95)',

  // Chart colors
  chartBar: '#19E65E',
  chartBarLight: 'rgba(25,230,94,0.3)',

  // Header
  headerDark: '#475569',

  // Pin
  pinGradientStart: '#FF8A96',
  pinGradientEnd: '#E04F5F',

  // Badge colors
  gold: '#F59E0B',
  silver: '#9CA3AF',
  bronze: '#D97706',
  locked: '#D1D5DB',
} as const;

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semiBold: 'System',
  bold: 'System',
} as const;

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  title: 30,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const BORDER_RADIUS = {
  sm: 2,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: '#1A1816',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1A1816',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1A1816',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
  },
} as const;
