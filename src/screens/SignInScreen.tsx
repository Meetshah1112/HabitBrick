import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ImageBackground,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/types';
import { Mail, Lock, Eye, EyeOff, ArrowRight, X } from 'lucide-react-native';
import { useDispatch } from 'react-redux';
import { signIn, sendPasswordReset } from '../api/authService';
import type { AppDispatch } from '../store/store';
import { refreshBackupStatus } from '../store/backupSlice';
import { getLegacyEmailHint } from '../api/legacyCredentialPurge';
import NoticeBanner, { type Notice } from '../components/NoticeBanner';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SignIn'>;
type SignInRoute = RouteProp<RootStackParamList, 'SignIn'>;


export default function SignInScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignInRoute>();
  const dispatch = useDispatch<AppDispatch>();
  const [email, setEmail] = useState(route.params?.prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Entrance animations
  const headerSlide = useRef(new Animated.Value(30)).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(50)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const footerFade = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.stagger(150, [
      Animated.parallel([
        Animated.timing(headerFade, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(headerSlide, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 600, useNativeDriver: false }),
        Animated.timing(cardSlide, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]),
      Animated.timing(footerFade, { toValue: 1, duration: 500, useNativeDriver: false }),
    ]).start();
  }, []);

  // Users of the old local-only builds had an email on file; offer it back.
  useEffect(() => {
    if (route.params?.prefillEmail) return;
    getLegacyEmailHint()
      .then((hint) => {
        if (hint) setEmail((current) => current || hint);
      })
      .catch(() => {});
  }, [route.params?.prefillEmail]);

  const handleSignIn = async () => {
    if (isSubmitting) return;
    setNotice(null);
    setIsSubmitting(true);
    const result = await signIn(email, password);
    setIsSubmitting(false);

    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }

    // Unclaimed habits on this device: ask before anything is uploaded.
    const backupCheck = await dispatch(refreshBackupStatus(result.data));
    const decision = refreshBackupStatus.fulfilled.match(backupCheck)
      ? backupCheck.payload?.decision
      : null;
    if (decision === 'needsConsent') {
      navigation.replace('CloudBackup');
      return;
    }
    // Presented as a modal over the app; auth state updates via the listener.
    navigation.goBack();
  };

  const handleForgotPassword = async () => {
    if (isSubmitting) return;
    setNotice(null);
    setIsSubmitting(true);
    const result = await sendPasswordReset(email);
    setIsSubmitting(false);

    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }
    // Same copy whether or not the address is registered (see authService).
    setNotice({
      kind: 'info',
      text: 'If an account exists for that email, a reset link is on its way.',
    });
  };

  const onPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  return (
    <ImageBackground
      source={require('../../assets/pattern_bg.png')}
      style={styles.container}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
    >
      <View pointerEvents="none" style={styles.backgroundOverlay} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS === 'ios'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color="#475569" strokeWidth={2} />
            </TouchableOpacity>

            {/* Header */}
            <Animated.View
              style={[
                styles.headerContainer,
                { opacity: headerFade, transform: [{ translateY: headerSlide }] },
              ]}
            >
              <View style={styles.logoContainer}>
                <View style={[styles.logoGradient, { backgroundColor: 'transparent', overflow: 'hidden' }]}>
                  <Animated.Image 
                    source={require('../../assets/logo.png')} 
                    style={{ width: '85%', height: '85%' }} 
                    resizeMode="contain" 
                  />
                </View>
              </View>
              <Text style={styles.appName}>HabitBrick</Text>
              <Text style={styles.title}>Welcome Back!!</Text>
              <Text style={styles.subtitle}>Back up your bricks and see your friends</Text>
            </Animated.View>

            {/* Card */}
            <Animated.View
              style={[
                styles.cardWrapper,
                { opacity: cardFade, transform: [{ translateY: cardSlide }] },
              ]}
            >
              <View style={styles.card}>
                {/* Subtle top accent line */}
                <LinearGradient
                  colors={['#FF9A62', '#E65C19', '#D4451A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cardAccent}
                />

                <View style={styles.inputGroup}>
                  {/* Email */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={styles.inputWrapper}>
                      <Mail
                        size={20}
                        color="#94A3B8"
                        style={styles.inputIcon}
                        strokeWidth={1.8}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="your@email.com"
                        placeholderTextColor="#CBD5E1"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        textContentType="emailAddress"
                      />
                    </View>
                  </View>

                  {/* Password */}
                  <View style={styles.fieldContainer}>
                    <View style={styles.labelRow}>
                      <Text style={styles.fieldLabel}>Password</Text>
                      <TouchableOpacity onPress={handleForgotPassword}>
                        <Text style={styles.forgotText}>Forgot?</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inputWrapper}>
                      <Lock
                        size={20}
                        color="#94A3B8"
                        style={styles.inputIcon}
                        strokeWidth={1.8}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="••••••••"
                        placeholderTextColor="#CBD5E1"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete="current-password"
                        textContentType="password"
                        onSubmitEditing={handleSignIn}
                        returnKeyType="go"
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {showPassword
                          ? <EyeOff size={20} color="#94A3B8" strokeWidth={1.8} />
                          : <Eye size={20} color="#94A3B8" strokeWidth={1.8} />}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <NoticeBanner notice={notice} />

                {/* Sign In Button */}
                <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
                  <TouchableOpacity
                    style={styles.buttonContainer}
                    onPress={handleSignIn}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    activeOpacity={1}
                    disabled={isSubmitting}
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  >
                    <LinearGradient
                      colors={['#FF9A62', '#E65C19']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.button}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Text style={styles.buttonText}>Sign In</Text>
                          <ArrowRight size={20} color="#FFF" strokeWidth={2.5} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>




              </View>
            </Animated.View>

            {/* Footer */}
            <Animated.View style={[styles.footerContainer, { opacity: footerFade }]}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => navigation.replace('SignUp', { prefillEmail: email.trim() || undefined })}
              >
                <Text style={styles.footerLink}>Sign Up</Text>
              </TouchableOpacity>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  backgroundImage: {
    opacity: 0.58,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250, 243, 235, 0.72)',
  },
  orbContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ---- Header ---
  headerContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    marginBottom: 12,
    shadowColor: '#E65C19',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E65C19',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  // ---- Card ----
  cardWrapper: {
    width: '100%',
    marginBottom: 28,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    padding: 24,
    paddingTop: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    // Glassmorphism shadow
    shadowColor: '#8A7A55',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 30,
    elevation: 10,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  // ---- Fields ----
  inputGroup: {
    width: '100%',
    gap: 20,
    marginBottom: 24,
  },
  fieldContainer: {
    width: '100%',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E65C19',
    marginRight: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    height: 52,
    paddingHorizontal: 14,
  },
  inputWrapperFocus: {
    borderColor: '#E65C19',
    backgroundColor: '#FFFAF7',
    shadowColor: '#E65C19',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  // ---- Button ----
  buttonContainer: {
    width: '100%',
    shadowColor: '#E65C19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 24,
  },
  button: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 16,
    gap: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ---- Divider ----
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
  },
  // ---- Social ----
  socialRow: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F8F9FC',
    borderWidth: 1,
    borderColor: '#EDF1F7',
    gap: 8,
  },
  socialEmoji: {
    fontSize: 18,
    fontWeight: '700',
    color: '#EA4335',
  },
  socialLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  // ---- Footer ----
  footerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E65C19',
  },
  forgotPasswordContainer: {
    marginTop: 12,
    alignSelf: 'flex-end',
    width: '100%',
    paddingRight: 4,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#94A3B8',
    textDecorationLine: 'underline',
    textAlign: 'right',
  },
});
