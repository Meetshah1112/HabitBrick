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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../navigation/types';
import {
  User, AtSign, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, XCircle,
} from 'lucide-react-native';
import { signUp, isUsernameAvailable, validateUsername } from '../api/authService';
import { getLegacyEmailHint } from '../api/legacyCredentialPurge';
import NoticeBanner, { type Notice } from '../components/NoticeBanner';
import { getPasswordStrength } from '../utils/passwordStrength';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SignUp'>;
type SignUpRoute = RouteProp<RootStackParamList, 'SignUp'>;

type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

const USERNAME_CHECK_DEBOUNCE_MS = 400;
/** The free-text name the user set on the Home screen, used as display name. */
const LOCAL_DISPLAY_NAME_KEY = '@atomicstep/username';

export default function SignUpScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<SignUpRoute>();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [email, setEmail] = useState(route.params?.prefillEmail ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);

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

  // Prefill from what this device already knows: the Home-screen name, and
  // the email from the old local-only builds.
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_DISPLAY_NAME_KEY)
      .then((stored) => {
        if (stored) setName((current) => current || stored);
      })
      .catch(() => {});
    if (route.params?.prefillEmail) return;
    getLegacyEmailHint()
      .then((hint) => {
        if (hint) setEmail((current) => current || hint);
      })
      .catch(() => {});
  }, [route.params?.prefillEmail]);

  // Live username availability. Debounced, and a request counter drops any
  // response that arrives after the user has typed something newer.
  const usernameRequestId = useRef(0);
  useEffect(() => {
    const trimmed = username.trim();
    usernameRequestId.current += 1;
    const requestId = usernameRequestId.current;

    if (!trimmed) {
      setUsernameStatus('idle');
      return;
    }
    if (validateUsername(trimmed)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      const result = await isUsernameAvailable(trimmed);
      if (requestId !== usernameRequestId.current) return; // stale response
      if (!result.ok) {
        setUsernameStatus('error');
        return;
      }
      setUsernameStatus(result.data ? 'available' : 'taken');
    }, USERNAME_CHECK_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [username]);

  const usernameHint = (() => {
    switch (usernameStatus) {
      case 'invalid':
        return { text: validateUsername(username) ?? '', color: '#B91C1C' };
      case 'checking':
        return { text: 'Checking...', color: '#64748B' };
      case 'available':
        return { text: 'Available', color: '#15803D' };
      case 'taken':
        return { text: 'That username is taken.', color: '#B91C1C' };
      case 'error':
        return { text: 'Could not check right now. You can still try.', color: '#64748B' };
      default:
        return { text: 'Friends find you by this. Letters, numbers, underscores.', color: '#64748B' };
    }
  })();

  const handleSignUp = async () => {
    if (isSubmitting) return;
    setNotice(null);

    if (password !== confirmPassword) {
      setNotice({ kind: 'error', text: 'Your passwords do not match.' });
      return;
    }
    if (usernameStatus === 'taken') {
      setNotice({ kind: 'error', text: 'That username is taken. Try another.' });
      return;
    }

    setIsSubmitting(true);
    const result = await signUp({ email, password, username, displayName: name });
    setIsSubmitting(false);

    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error });
      return;
    }

    if (result.data.needsEmailConfirmation) {
      const sentTo = email.trim();
      setConfirmationSentTo(sentTo);
      setNotice({
        kind: 'info',
        text: `Almost there. We sent a confirmation link to ${sentTo}. Tap it, then sign in.`,
      });
      return;
    }

    // Signed in immediately (email confirmation disabled on the project).
    navigation.goBack();
  };

  const goToSignIn = () => {
    const prefill = confirmationSentTo ?? (email.trim() || undefined);
    navigation.replace('SignIn', { prefillEmail: prefill });
  };

  const onPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  const strength = getPasswordStrength(password);

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
            {/* Back button */}
            <Animated.View style={[styles.backRow, { opacity: headerFade }]}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
                activeOpacity={0.7}
              >
                <ArrowLeft size={18} color="#475569" strokeWidth={2} />
              </TouchableOpacity>
            </Animated.View>

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
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Back up your bricks and add friends</Text>
            </Animated.View>

            {/* Card */}
            <Animated.View
              style={[
                styles.cardWrapper,
                { opacity: cardFade, transform: [{ translateY: cardSlide }] },
              ]}
            >
              <View style={styles.card}>
                {/* Top accent */}
                <LinearGradient
                  colors={['#34D399', '#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cardAccent}
                />

                <View style={styles.inputGroup}>
                  {/* Username */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Username</Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        usernameStatus === 'available' && styles.inputWrapperMatch,
                        (usernameStatus === 'taken' || usernameStatus === 'invalid') &&
                          styles.inputWrapperMismatch,
                      ]}
                    >
                      <AtSign size={20} color="#94A3B8" style={styles.inputIcon} strokeWidth={1.8} />
                      <TextInput
                        style={styles.input}
                        placeholder="brick_builder"
                        placeholderTextColor="#CBD5E1"
                        value={username}
                        onChangeText={setUsername}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username-new"
                        textContentType="username"
                        maxLength={20}
                      />
                      {usernameStatus === 'checking' && <ActivityIndicator size="small" color="#94A3B8" />}
                      {usernameStatus === 'available' && (
                        <CheckCircle2 size={20} color="#10B981" strokeWidth={2} />
                      )}
                      {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                        <XCircle size={20} color="#EF4444" strokeWidth={2} />
                      )}
                    </View>
                    <Text style={[styles.fieldHint, { color: usernameHint.color }]}>
                      {usernameHint.text}
                    </Text>
                  </View>

                  {/* Display name (optional) */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Name (optional)</Text>
                    <View style={styles.inputWrapper}>
                      <User size={20} color="#94A3B8" style={styles.inputIcon} strokeWidth={1.8} />
                      <TextInput
                        style={styles.input}
                        placeholder="What friends see"
                        placeholderTextColor="#CBD5E1"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoComplete="name"
                        textContentType="name"
                        maxLength={40}
                      />
                    </View>
                  </View>

                  {/* Email */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Email</Text>
                    <View style={styles.inputWrapper}>
                      <Mail size={20} color="#94A3B8" style={styles.inputIcon} strokeWidth={1.8} />
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
                    <Text style={styles.fieldLabel}>Password</Text>
                    <View style={styles.inputWrapper}>
                      <Lock size={20} color="#94A3B8" style={styles.inputIcon} strokeWidth={1.8} />
                      <TextInput
                        style={styles.input}
                        placeholder="Min. 8 characters"
                        placeholderTextColor="#CBD5E1"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                        autoComplete="new-password"
                        textContentType="newPassword"
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        {showPassword ? <EyeOff size={20} color="#94A3B8" strokeWidth={1.8} /> : <Eye size={20} color="#94A3B8" strokeWidth={1.8} />}
                      </TouchableOpacity>
                    </View>
                    {/* Password strength bar */}
                    {strength && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthTrack}>
                          <Animated.View
                            style={[
                              styles.strengthFill,
                              { width: `${strength.percent}%`, backgroundColor: strength.color },
                            ]}
                          />
                        </View>
                        <Text style={[styles.strengthLabel, { color: strength.color }]}>
                          {strength.label}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Confirm Password */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Confirm Password</Text>
                    <View
                      style={[
                        styles.inputWrapper,
                        confirmPassword.length > 0 &&
                        password === confirmPassword && styles.inputWrapperMatch,
                        confirmPassword.length > 0 &&
                        password !== confirmPassword && styles.inputWrapperMismatch,
                      ]}
                    >
                      <Lock
                        size={20}
                        color={
                          confirmPassword.length > 0 && password === confirmPassword
                            ? '#10B981'
                            : confirmPassword.length > 0 && password !== confirmPassword
                              ? '#EF4444'
                              : '#94A3B8'
                        }
                        strokeWidth={1.8}
                        style={styles.inputIcon}
                      />
                      <TextInput
                        style={styles.input}
                        placeholder="Re-enter password"
                        placeholderTextColor="#CBD5E1"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirmPassword}
                        autoComplete="new-password"
                        textContentType="newPassword"
                      />
                      {confirmPassword.length > 0 && (
                        password === confirmPassword
                          ? <CheckCircle2 size={20} color="#10B981" strokeWidth={2} />
                          : <XCircle size={20} color="#EF4444" strokeWidth={2} />
                      )}
                    </View>
                  </View>
                </View>

                <NoticeBanner notice={notice} />

                {/* Create Account Button */}
                <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
                  <TouchableOpacity
                    style={styles.buttonContainer}
                    onPress={confirmationSentTo ? goToSignIn : handleSignUp}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    activeOpacity={1}
                    disabled={isSubmitting}
                    accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
                  >
                    <LinearGradient
                      colors={['#34D399', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.button}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator color="#FFF" />
                      ) : (
                        <>
                          <Text style={styles.buttonText}>
                            {confirmationSentTo ? 'Go to Sign In' : 'Create Account'}
                          </Text>
                          <ArrowRight size={20} color="#FFF" strokeWidth={2.5} />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </Animated.View>

                {/* Terms */}
                <Text style={styles.termsText}>
                  By signing up, you agree to our{' '}
                  <Text 
                    style={styles.termsLink} 
                    onPress={() => navigation.navigate('Legal', { type: 'terms' })}
                  >
                    Terms of Service
                  </Text> and{' '}
                  <Text 
                    style={styles.termsLink} 
                    onPress={() => navigation.navigate('Legal', { type: 'privacy' })}
                  >
                    Privacy Policy
                  </Text>
                </Text>
              </View>
            </Animated.View>

            {/* Footer */}
            <Animated.View style={[styles.footerContainer, { opacity: footerFade }]}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <TouchableOpacity onPress={goToSignIn}>
                <Text style={styles.footerLink}>Sign In</Text>
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
  fieldHint: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
  },
  backgroundImage: {
    opacity: 0.58,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(248, 244, 236, 0.72)',
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
    paddingTop: 10,
    paddingBottom: 40,
    alignItems: 'center',
  },
  // ---- Back ----
  backRow: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  // ---- Header ----
  headerContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
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
  title: {
    fontSize: 28,
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
    marginBottom: 24,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 24,
    padding: 24,
    paddingTop: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    shadowColor: '#5C8A66',
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
    gap: 18,
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
  inputWrapperFocusGreen: {
    borderColor: '#059669',
    backgroundColor: '#F0FFF8',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  inputWrapperMatch: {
    borderColor: '#10B981',
    backgroundColor: '#F0FFF8',
  },
  inputWrapperMismatch: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FFF5F5',
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
  // ---- Password Strength ----
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  strengthTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // ---- Button ----
  buttonContainer: {
    width: '100%',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 16,
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
  // ---- Terms ----
  termsText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#059669',
    fontWeight: '600',
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
    color: '#059669',
  },
});
