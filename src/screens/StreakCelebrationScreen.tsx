import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LottieView from 'lottie-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../constants/theme';
import { LinearGradient } from 'expo-linear-gradient';

type ScreenRouteProp = RouteProp<RootStackParamList, 'StreakCelebration'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Card dimensions after shrink (centred on screen)
const CARD_W = SCREEN_W * 0.85;
const CARD_H = CARD_W * 1.2;
const CARD_LEFT = (SCREEN_W - CARD_W) / 2;
const CARD_TOP = SCREEN_H * 0.05; // moved slightly higher to leave more room at bottom

const SHRINK_DURATION = 800;

// ─────────────────────────────────────────────────────────────────────────────
// Config per trigger type
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  allComplete: {
    bg: ['#1A0F00', '#3D1F00', '#1A0F00'] as [string, string, string],
    accentColor: '#F97316',
    titleColor: '#FFF7ED',
    subtitleColor: '#FCD9B2',
    animation: require('../../assets/animations/Flame_lit.json'),
    loop: false,
    headline: '🔥 Streak Alive!',
    subline: 'You crushed every habit today.',
    btnLabel: 'LET\'S GO',
    btnGradient: ['#EA580C', '#F97316'] as [string, string],
  },
  noneComplete: {
    bg: ['#0A0A14', '#111827', '#0A0A14'] as [string, string, string],
    accentColor: '#6B7280',
    titleColor: '#F1F5F9',
    subtitleColor: '#94A3B8',
    animation: require('../../assets/animations/Candle_Blown.json'),
    loop: false,
    headline: '💨 Flame Out…',
    subline: 'None of today\'s habits were completed.',
    btnLabel: 'START OVER',
    btnGradient: ['#374151', '#4B5563'] as [string, string],
  },
  none: {
    bg: ['#1A0F00', '#3D1F00', '#1A0F00'] as [string, string, string],
    accentColor: '#F97316',
    titleColor: '#FFF7ED',
    subtitleColor: '#FCD9B2',
    animation: require('../../assets/animations/Flame_lit.json'),
    loop: false,
    headline: '🔥 Keep Going!',
    subline: 'Every day counts.',
    btnLabel: 'CONTINUE',
    btnGradient: ['#EA580C', '#F97316'] as [string, string],
  },
};

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// ─────────────────────────────────────────────────────────────────────────────

export default function StreakCelebrationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<ScreenRouteProp>();

  const {
    streak = 0,
    status: _status = 'maintained',
    weeklyProgress = Array(7).fill(false),
    triggerType = 'none',
    scheduledCount = 0,
    completedCount = 0,
  } = route.params || {};

  const cfg = CONFIG[triggerType as keyof typeof CONFIG] ?? CONFIG.none;
  const isSuccess = triggerType === 'allComplete';

  // ── Animation drivers ───────────────────────────────────────────────────
  const animationRef = useRef<LottieView>(null);

  // Phase controller: 0 = full-screen animation, 1 = after shrink
  const [phase, setPhase] = useState<0 | 1>(0);

  // Shrink interpolation (0 → 1)
  const shrinkAnim = useRef(new Animated.Value(0)).current;

  // Stats fade+slide
  const statsFade = useRef(new Animated.Value(0)).current;
  const statsSlide = useRef(new Animated.Value(50)).current;

  // Headline (phase 0)
  const headlineFade = useRef(new Animated.Value(0)).current;

  // Button scale
  const btnScale = useRef(new Animated.Value(0)).current;

  // Frost fade in for missed days
  const frostAnim = useRef(new Animated.Value(0)).current;

  // Guard so the transition only fires once
  const transitionFired = useRef(false);

  // ── Phase 0: start Lottie + fade in headline ───────────────────────────
  // Flame_lit.json: 192 frames @ 24fps (8s). Trim to frame 134 (~5.6s)
  // to cut the long idle tail after the candle is fully lit.
  // Candle_Blown.json plays in full (untouched).
  const FLAME_END_FRAME = 134;

  useEffect(() => {
    if (isSuccess || triggerType === 'none') {
      animationRef.current?.play(0, FLAME_END_FRAME);
    } else {
      animationRef.current?.play();
    }

    // Gentle headline fade-in while animation plays
    Animated.timing(headlineFade, {
      toValue: 1,
      duration: 800,
      delay: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // ── Transition: shrink container + reveal stats ────────────────────────
  const runTransition = useCallback(() => {
    if (transitionFired.current) return;
    transitionFired.current = true;
    setPhase(1);

    // 1. Shrink the animation container
    Animated.timing(shrinkAnim, {
      toValue: 1,
      duration: SHRINK_DURATION,
      useNativeDriver: false, // layout props
    }).start();

    // 2. Stats slide up (slightly delayed so shrink is half-done)
    Animated.sequence([
      Animated.delay(SHRINK_DURATION * 0.4),
      Animated.parallel([
        Animated.timing(statsFade, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(statsSlide, {
          toValue: 0,
          tension: 55,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(btnScale, {
          toValue: 1,
          tension: 65,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(frostAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [shrinkAnim, statsFade, statsSlide, btnScale, frostAnim]);

  // Safety fallback: if Lottie never fires onAnimationFinish, run after 5s
  useEffect(() => {
    const timer = setTimeout(() => {
      runTransition();
    }, 4000);
    return () => clearTimeout(timer);
  }, [runTransition]);

  // ── Lottie finish handler ──────────────────────────────────────────────
  const handleAnimationFinish = useCallback(
    (isCancelled: boolean) => {
      if (!isCancelled) {
        runTransition();
      }
    },
    [runTransition],
  );

  // ── Interpolated layout for the animation container ────────────────────
  const animTop = shrinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CARD_TOP],
  });
  const animLeft = shrinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, CARD_LEFT],
  });
  const animWidth = shrinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_W, CARD_W],
  });
  const animHeight = shrinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SCREEN_H, CARD_H],
  });
  const animBorderRadius = shrinkAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 28],
  });

  // Overlay fades out during shrink
  const overlayOpacity = shrinkAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [0.35, 0.1, 0],
  });

  const handleContinue = () => {
    navigation.navigate('Tabs');
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={cfg.bg[0]} />
      <LinearGradient colors={cfg.bg} style={styles.root}>

        {/* ── Animated Lottie container ── */}
        <Animated.View
          style={[
            styles.animBox,
            {
              top: animTop,
              left: animLeft,
              width: animWidth,
              height: animHeight,
              borderRadius: animBorderRadius,
            },
          ]}
        >
          <LottieView
            ref={animationRef}
            source={cfg.animation}
            autoPlay={false}
            loop={cfg.loop}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            onAnimationFinish={handleAnimationFinish}
          />

          {/* Overlay — only during phase 0 */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(0,0,0,1)', opacity: overlayOpacity },
            ]}
            pointerEvents="none"
          />
        </Animated.View>

        {/* ── Phase 0: headline floating above full-screen animation ── */}
        {phase === 0 && (
          <Animated.View style={[styles.phase0Headline, { opacity: headlineFade }]}>
            <SafeAreaView edges={['top']}>
              <Text style={[styles.headline, { color: cfg.titleColor }]}>
                {cfg.headline}
              </Text>
              <Text style={[styles.subline, { color: cfg.subtitleColor }]}>
                {cfg.subline}
              </Text>
            </SafeAreaView>
          </Animated.View>
        )}

        {/* ── Phase 1: stats underneath the shrunken card ── */}
        {phase === 1 && (
          <SafeAreaView style={styles.phase1Safe} edges={['top', 'bottom']}>
            {/* Spacer to push content below the card */}
            <View style={{ height: CARD_TOP + CARD_H + 8 }} />

            <Animated.View
              style={[
                styles.statsContainer,
                {
                  opacity: statsFade,
                  transform: [{ translateY: statsSlide }],
                },
              ]}
            >
              {/* Headline (smaller in phase 1) */}
              <Text style={[styles.headlineSm, { color: cfg.titleColor }]}>
                {cfg.headline}
              </Text>
              <Text style={[styles.sublineSm, { color: cfg.subtitleColor }]}>
                {cfg.subline}
              </Text>

              {/* Habit count pill */}
              {scheduledCount > 0 && (
                <View style={[styles.countPill, { borderColor: cfg.accentColor + '55' }]}>
                  <Text style={[styles.countPillText, { color: cfg.accentColor }]}>
                    {isSuccess
                      ? `${completedCount}/${scheduledCount} habits completed`
                      : `0/${scheduledCount} habits completed`}
                  </Text>
                </View>
              )}

              {/* Streak number */}
              <View style={styles.streakRow}>
                <Text style={[styles.streakNumber, { color: cfg.accentColor }]}>
                  {streak}
                </Text>
                <View style={styles.streakLabelCol}>
                  <Text style={[styles.streakLabel, { color: cfg.accentColor }]}>DAY</Text>
                  <Text style={[styles.streakLabel, { color: cfg.accentColor }]}>STREAK</Text>
                </View>
              </View>

              {/* Weekly progress dots */}
              <View style={styles.weeklyRow}>
                {DAYS.map((day, i) => {
                  const status = weeklyProgress[i];
                  return (
                    <View key={i} style={styles.dayCol}>
                      <View
                        style={[
                          styles.dayRing,
                          {
                            borderColor: status === 'completed'
                              ? '#F97316'
                              : status === 'missed'
                                ? 'rgba(255,255,255,0.05)'
                                : 'rgba(255,255,255,0.15)',
                            backgroundColor: status === 'completed' ? '#F9731622' : 'transparent',
                          },
                        ]}
                      >
                        {status === 'completed' && (
                          <View style={[styles.dayDot, { backgroundColor: '#F97316' }]} />
                        )}
                        {status === 'missed' && (
                          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: frostAnim, borderRadius: 18, overflow: 'hidden' }]}>
                            <LinearGradient
                              colors={['rgba(165,243,252,0.4)', 'rgba(34,211,238,0.15)']}
                              style={StyleSheet.absoluteFillObject}
                              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                            />
                            {/* Inner icy border that shimmers */}
                            <View style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(207,250,254,0.6)' }} />
                            {/* Small frost icon in center */}
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
                              <Text style={{ fontSize: 10, opacity: 0.8 }}>❄️</Text>
                            </View>
                          </Animated.View>
                        )}
                      </View>
                      <Text style={styles.dayLabelText}>{day}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Weekly progress dots */}
            </Animated.View>

            {/* CTA */}
            <Animated.View
              style={[
                styles.btnWrap,
                {
                  opacity: statsFade,
                  transform: [{ scale: btnScale }],
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleContinue}
                style={styles.btnOuter}
              >
                <LinearGradient
                  colors={cfg.btnGradient}
                  style={styles.btn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.btnText}>{cfg.btnLabel}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          </SafeAreaView>
        )}

      </LinearGradient>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: SCREEN_W,
    height: SCREEN_H,
  },

  // ── Animated Lottie container ────────────────────────────────────────────
  animBox: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 10,
    // subtle shadow once it starts becoming a card
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 16,
  },

  // ── Phase 0: title floating over full-screen anim ──────────────────────
  phase0Headline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: SPACING.xl * 2,
    alignItems: 'center',
    zIndex: 20,
  },
  headline: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  subline: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: SPACING.sm,
    opacity: 0.9,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },

  // ── Phase 1: stats below the card ──────────────────────────────────────
  phase1Safe: {
    flex: 1,
    zIndex: 5,
  },
  statsContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm, // Reduced from lg to save vertical space
  },
  headlineSm: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  sublineSm: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.85,
    marginTop: -SPACING.sm,
  },
  countPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  countPillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  streakNumber: {
    fontSize: 80,
    fontWeight: '900',
    lineHeight: 88,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
  },
  streakLabelCol: {
    justifyContent: 'center',
  },
  streakLabel: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Weekly dots
  weeklyRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  dayCol: {
    alignItems: 'center',
    gap: 6,
  },
  dayRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  dayLabelText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
  },

  // CTA
  btnWrap: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
    width: '100%',
  },
  btnOuter: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  btn: {
    paddingVertical: SPACING.lg + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
});
