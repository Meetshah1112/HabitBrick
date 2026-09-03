import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Image,
  Text,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
type WelcomeRouteProp = RouteProp<RootStackParamList, 'Welcome'>;

const QUOTE = 'Tiny steps give atomic results — so let us take tiny steps and get atomic results.';

/**
 * WelcomeScreen — Splash variant.
 *
 * Auto-advances to Tabs (or AddHabit for new users) after 2.5s.
 * Logic unchanged from the committed version's navigation contract.
 *
 * Visual treatment:
 *  - Concentric halo ring around logo for depth
 *  - Paper-card logo tile (radius 32, padding 0 → image fills full radius)
 *  - Swiss-style eyebrow caps under the wordmark
 *  - Deterministic pill loader (0→100% over 2.5s)
 *  - Warm + cool atmospheric blobs behind everything
 */
export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<WelcomeRouteProp>();
  const isNewUser = route.params?.isNewUser ?? false;

  // Entrance animations
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.88)).current;
  const ringFade = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const nameFade = useRef(new Animated.Value(0)).current;
  const nameSlide = useRef(new Animated.Value(8)).current;
  const quoteFade = useRef(new Animated.Value(0)).current;
  const loaderProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(180, [
      Animated.parallel([
        Animated.timing(logoFade, {
          toValue: 1,
          duration: 520,
          easing: Easing.bezier(0.2, 0.8, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          damping: 22,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(ringFade, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.spring(ringScale, { toValue: 1, damping: 18, stiffness: 90, useNativeDriver: true }),
        ]),
      ]),
      Animated.parallel([
        Animated.timing(nameFade, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.timing(nameSlide, {
          toValue: 0,
          duration: 480,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(quoteFade, { toValue: 1, duration: 520, useNativeDriver: true }),
    ]).start();

    // Pill loader fills over the same 2.5s as the auto-advance — gives the
    // user visible forward motion instead of a generic spinner.
    Animated.timing(loaderProgress, {
      toValue: 1,
      duration: 2500,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();

    // ── Same 2.5s timer + navigation.replace as the committed version ──
    const timer = setTimeout(() => {
      if (isNewUser) {
        navigation.replace('Tabs', { screen: 'AddHabit' });
      } else {
        navigation.replace('Tabs');
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [isNewUser, navigation]);

  const loaderWidth = loaderProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Atmospheric blobs — warm top, cool bottom — add depth without imagery */}
      <View pointerEvents="none" style={styles.vignetteTop} />
      <View pointerEvents="none" style={styles.vignetteBottom} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          {/* Logo + concentric halo ring */}
          <View style={styles.logoStack}>
            <Animated.View
              style={[
                styles.haloRing,
                { opacity: ringFade, transform: [{ scale: ringScale }] },
              ]}
            />
            <Animated.View
              style={[
                styles.logoWrap,
                { opacity: logoFade, transform: [{ scale: logoScale }] },
              ]}
            >
              <Image
                source={require('../../assets/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
            </Animated.View>
          </View>

          {/* Wordmark */}
          <Animated.Text
            style={[
              styles.appName,
              { opacity: nameFade, transform: [{ translateY: nameSlide }] },
            ]}
          >
            HabitBrick
          </Animated.Text>

          {/* Swiss-style eyebrow caps */}
          <Animated.Text style={[styles.eyebrow, { opacity: nameFade }]}>
            ATOMIC HABITS · DAILY
          </Animated.Text>

          <Animated.Text style={[styles.quote, { opacity: quoteFade }]}>
            {QUOTE}
          </Animated.Text>

          {/* Deterministic pill loader */}
          <Animated.View style={[styles.loaderRow, { opacity: quoteFade }]}>
            <View style={styles.loaderTrack}>
              <Animated.View style={[styles.loaderFill, { width: loaderWidth }]} />
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gradientStart, // warm paper beige
  },
  // Warm halo top — subtle ambient glow in brand orange.
  vignetteTop: {
    position: 'absolute',
    top: -120,
    left: -80,
    right: -80,
    height: 280,
    borderRadius: 200,
    backgroundColor: 'rgba(232, 110, 60, 0.06)',
  },
  // Cool counterweight bottom — keeps composition balanced.
  vignetteBottom: {
    position: 'absolute',
    bottom: -160,
    left: -100,
    right: -100,
    height: 320,
    borderRadius: 240,
    backgroundColor: 'rgba(31, 29, 27, 0.04)',
  },
  safeArea: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxxl,
  },
  logoStack: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xxl,
  },
  // Concentric halo — 1px ring in brand orange @ 18% — anchors the logo.
  haloRing: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 1,
    borderColor: 'rgba(232, 110, 60, 0.18)',
  },
  // Paper-card logo tile.
  // Nesting math: outer radius 32, inner padding 0 → image fills full radius.
  logoWrap: {
    width: 116,
    height: 116,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FCFAF6', // warm paper-high, not pure white
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  // logoWrap has padding 0 + overflow: 'hidden', so the image at 100%
  // fills the card right up to the 32-radius rounded corners.
  logo: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: '#1F1D1B',
    letterSpacing: -0.8,
    marginBottom: SPACING.sm,
  },
  // Swiss-style eyebrow: tight tracking, uppercase, brand accent.
  eyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#E86E3C', // brand terracotta — only sparingly used
    letterSpacing: 2.4,
    marginBottom: SPACING.xxl,
  },
  quote: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22, // ~1.5× — readable on mobile
    fontWeight: '500',
    color: '#5A534B',
    textAlign: 'center',
    fontStyle: 'italic',
    maxWidth: 320,
  },
  loaderRow: {
    marginTop: SPACING.xxxl,
    width: 96,
  },
  loaderTrack: {
    height: 3,
    backgroundColor: 'rgba(31, 29, 27, 0.08)',
    borderRadius: 9999,
    overflow: 'hidden',
  },
  loaderFill: {
    height: '100%',
    backgroundColor: '#E86E3C',
    borderRadius: 9999,
  },
});
