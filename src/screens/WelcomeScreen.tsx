import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  ImageBackground,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SHADOWS } from '../constants/theme';
import Svg, { Path, Circle } from 'react-native-svg';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;
type WelcomeRouteProp = RouteProp<RootStackParamList, 'Welcome'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HeartSvg = ({ size, color }: any) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
  </Svg>
);

const TargetSvg = ({ size, color }: any) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="11" fill={color} opacity="0.2" />
    <Circle cx="12" cy="12" r="7" fill={color} opacity="0.5" />
    <Circle cx="12" cy="12" r="3.5" fill={color} />
  </Svg>
);

const SparklesSvg = ({ size, color }: any) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M10 2l1.6 4.8c.2.6.7 1.1 1.3 1.3L17.7 9.7l-4.8 1.6c-.6.2-1.1.7-1.3 1.3L10 17.4l-1.6-4.8c-.2-.6-.7-1.1-1.3-1.3L2.3 9.7l4.8-1.6c.6-.2 1.1-.7 1.3-1.3L10 2z" fill={color} />
    <Path d="M19 14l.8 2.4c.1.3.4.6.7.7l2.4.8-2.4.8c-.3.1-.6.4-.7.7L19 21.8l-.8-2.4c-.1-.3-.4-.6-.7-.7l-2.4-.8 2.4-.8c.3-.1.6-.4.7-.7L19 14z" fill={color} opacity="0.7"/>
    <Path d="M18.8 4.2l.5 1.5c.1.2.2.3.4.4l1.5.5-1.5.5c-.2.1-.3.2-.4.4l-.5 1.5-.5-1.5c-.1-.2-.2-.3-.4-.4L16.4 6.6l1.5-.5c.2-.1.3-.2.4-.4l.5-1.5z" fill={color} opacity="0.5" />
  </Svg>
);

const ArrowRightSvg = ({ size, color }: any) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
  </Svg>
);

const REASONS = [
  {
    icon: HeartSvg,
    title: 'Develop Healthy & Happy Habits',
    subtitle: 'Build routines that nurture your well-being every day',
    color: COLORS.stickyPink,
    iconColor: '#BE185D',
    accentColor: '#F9A8D4',
  },
  {
    icon: TargetSvg,
    title: 'Achieve Your Goals',
    subtitle: 'Reach personal and professional milestones, one step at a time',
    color: COLORS.stickyGreen,
    iconColor: '#166534',
    accentColor: '#A7F3D0',
  },
  {
    icon: SparklesSvg,
    title: 'Become Your Best Self',
    subtitle: 'Stay healthy, calm, happy, and flexible in every area of life',
    color: COLORS.stickyBlue,
    iconColor: '#1E40AF',
    accentColor: '#93C5FD',
  },
];

export default function WelcomeScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<WelcomeRouteProp>();
  const isNewUser = route.params?.isNewUser ?? false;
  const [isBuffering, setIsBuffering] = useState(false);

  // ─── Entrance animations ────────────────────────────────────
  const greetingFade = useRef(new Animated.Value(0)).current;
  const greetingSlide = useRef(new Animated.Value(25)).current;

  const brandFade = useRef(new Animated.Value(0)).current;
  const brandSlide = useRef(new Animated.Value(30)).current;

  const mottoFade = useRef(new Animated.Value(0)).current;
  const mottoSlide = useRef(new Animated.Value(30)).current;

  const reason0Fade = useRef(new Animated.Value(0)).current;
  const reason0Slide = useRef(new Animated.Value(40)).current;
  const reason1Fade = useRef(new Animated.Value(0)).current;
  const reason1Slide = useRef(new Animated.Value(40)).current;
  const reason2Fade = useRef(new Animated.Value(0)).current;
  const reason2Slide = useRef(new Animated.Value(40)).current;

  const ctaFade = useRef(new Animated.Value(0)).current;
  const ctaSlide = useRef(new Animated.Value(30)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  const reasonFades = [reason0Fade, reason1Fade, reason2Fade];
  const reasonSlides = [reason0Slide, reason1Slide, reason2Slide];

  useEffect(() => {
    Animated.stagger(180, [
      // Greeting
      Animated.parallel([
        Animated.timing(greetingFade, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(greetingSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      // Branding
      Animated.parallel([
        Animated.timing(brandFade, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(brandSlide, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
      // Motto card
      Animated.parallel([
        Animated.timing(mottoFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(mottoSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // Reason cards
      Animated.parallel([
        Animated.timing(reason0Fade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(reason0Slide, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(reason1Fade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(reason1Slide, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(reason2Fade, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(reason2Slide, { toValue: 0, duration: 450, useNativeDriver: true }),
      ]),
      // CTA button
      Animated.parallel([
        Animated.timing(ctaFade, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(ctaSlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const handleGetStarted = () => {
    if (isBuffering) return;
    setIsBuffering(true);
    // Only buffer AFTER Get Started is clicked
    setTimeout(() => {
      if (isNewUser) {
        navigation.replace('Tabs', { screen: 'AddHabit' });
      } else {
        navigation.replace('Tabs');
      }
    }, 2000);
  };

  const onPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.95, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  return (
    <ImageBackground
      source={require('../../assets/custom_welcome_bg.png')}
      style={styles.container}
      blurRadius={3}
      resizeMode="cover"
    >
      <View style={styles.overlay} />

      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ─── Greeting ─── */}
          <Animated.View
            style={[
              styles.greetingContainer,
              { opacity: greetingFade, transform: [{ translateY: greetingSlide }] },
            ]}
          >
            <Text style={styles.namaste}>Namaste 🙏</Text>
            <Text style={styles.welcomeText}>
              Welcome to your journey of transformation
            </Text>
          </Animated.View>

          {/* ─── Branding ─── */}
          <Animated.View
            style={[
              styles.brandContainer,
              { opacity: brandFade, transform: [{ translateY: brandSlide }] },
            ]}
          >
            <View style={styles.logoWrapper}>
              <View style={[styles.logoGradient, { backgroundColor: 'transparent', overflow: 'hidden' }]}>
                <Image
                  source={require('../../assets/logo.png')}
                  style={{ width: '85%', height: '85%' }}
                  resizeMode="contain"
                />
              </View>
            </View>
            <Text style={styles.appName}>HabitBrick</Text>
            <View style={styles.taglineRow}>
              <View style={styles.taglineLine} />
              <Text style={styles.tagline}>Build your habits, brick by brick</Text>
              <View style={styles.taglineLine} />
            </View>
          </Animated.View>

          {/* ─── Motive Card ─── */}
          <Animated.View
            style={[
              styles.motiveCard,
              { opacity: mottoFade, transform: [{ translateY: mottoSlide }] },
            ]}
          >
            {/* Tape strip decoration */}
            <View style={styles.tapeStrip}>
              <LinearGradient
                colors={['rgba(255,220,180,0.7)', 'rgba(255,200,150,0.4)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.tapeGradient}
              />
            </View>
            <Text style={styles.motiveEmoji}>✨</Text>
            <Text style={styles.motiveTitle}>Our Mission</Text>
            <Text style={styles.motiveText}>
              We blend the best knowledge with innovative techniques to help you build lasting habits
            </Text>
          </Animated.View>

          {/* ─── Reasons to Join ─── */}
          <View style={styles.reasonsHeader}>
            <Animated.Text
              style={[
                styles.reasonsSectionTitle,
                { opacity: reason0Fade },
              ]}
            >
              Why HabitBrick?
            </Animated.Text>
          </View>

          {REASONS.map((reason, index) => {
            const IconComponent = reason.icon;
            return (
              <Animated.View
                key={index}
                style={[
                  styles.reasonCard,
                  { backgroundColor: reason.color },
                  {
                    opacity: reasonFades[index],
                    transform: [{ translateY: reasonSlides[index] }],
                  },
                ]}
              >
                <View style={[styles.reasonIconCircle, { backgroundColor: reason.accentColor }]}>
                  <IconComponent
                    size={28}
                    color={reason.iconColor}
                  />
                </View>
                <View style={styles.reasonTextContainer}>
                  <Text style={styles.reasonTitle}>{reason.title}</Text>
                  <Text style={styles.reasonSubtitle}>{reason.subtitle}</Text>
                </View>
              </Animated.View>
            );
          })}

          {/* ─── CTA Button ─── */}
          <Animated.View
            style={[
              styles.ctaContainer,
              {
                opacity: ctaFade,
                transform: [{ translateY: ctaSlide }, { scale: buttonScale }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={handleGetStarted}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              activeOpacity={1}
              disabled={isBuffering}
            >
              <LinearGradient
                colors={['#FF9A62', '#E65C19']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Text style={styles.ctaText}>{isBuffering ? 'Getting Ready...' : 'Get Started'}</Text>
                {!isBuffering && <ArrowRightSvg size={24} color="#FFF" />}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Bottom breathing room */}
          <View style={{ height: 30 }} />
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 252, 247, 0.28)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },

  // ─── Greeting ───
  greetingContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  namaste: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ─── Branding ───
  brandContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoWrapper: {
    marginBottom: 14,
    shadowColor: '#E65C19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  logoGradient: {
    width: 100,
    height: 100,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1E293B',
    letterSpacing: -1,
    marginBottom: 8,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  taglineLine: {
    width: 28,
    height: 1.5,
    backgroundColor: '#E65C19',
    borderRadius: 1,
    opacity: 0.5,
  },
  tagline: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65C19',
    letterSpacing: 0.5,
  },

  // ─── Motive Card ───
  motiveCard: {
    width: '100%',
    backgroundColor: COLORS.stickyYellow,
    borderRadius: 12,
    padding: 24,
    paddingTop: 30,
    marginBottom: 28,
    ...SHADOWS.md,
    overflow: 'hidden',
  },
  tapeStrip: {
    position: 'absolute',
    top: -4,
    left: '50%',
    marginLeft: -30,
    width: 60,
    height: 18,
    borderRadius: 2,
    overflow: 'hidden',
    transform: [{ rotate: '-2deg' }],
  },
  tapeGradient: {
    flex: 1,
  },
  motiveEmoji: {
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 6,
  },
  motiveTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 8,
  },
  motiveText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },

  // ─── Reasons Section ───
  reasonsHeader: {
    width: '100%',
    marginBottom: 14,
  },
  reasonsSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: -0.3,
  },

  reasonCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 18,
    marginBottom: 14,
    ...SHADOWS.sm,
    overflow: 'hidden',
  },
  reasonIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  reasonTextContainer: {
    flex: 1,
  },
  reasonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 3,
  },
  reasonSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 18,
  },

  // ─── CTA ───
  ctaContainer: {
    width: '100%',
    marginTop: 10,
    shadowColor: '#E65C19',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  ctaButton: {
    width: '100%',
  },
  ctaGradient: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 58,
    borderRadius: 18,
    gap: 10,
  },
  ctaText: {
    color: '#FFF',
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
