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
  Dimensions,
  ImageBackground,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONT_SIZES, SPACING } from '../constants/theme';
import { Rocket, User, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'SignUp'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');



export default function SignUpScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


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



  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert('Incomplete', 'Please fill out all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Your passwords do not match.');
      return;
    }

    try {
      await AsyncStorage.setItem('@atomicstep/username', name.trim());
      await AsyncStorage.setItem('@atomicstep/email', email.trim());
      await AsyncStorage.setItem('@atomicstep/password', password);
      await AsyncStorage.setItem('@atomicstep/isLoggedIn', 'false');
      const today = new Date().toISOString().split('T')[0];
      await AsyncStorage.setItem('@atomicstep/isLoggedIn', 'true');
      navigation.replace('Welcome', { isNewUser: true });
    } catch (e) {
      Alert.alert('Error', 'Could not create account.');
    }
  };

  const onPressIn = () => {
    Animated.spring(buttonScale, { toValue: 0.96, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(buttonScale, { toValue: 1, friction: 3, useNativeDriver: true }).start();
  };

  // Password strength indicator
  const getPasswordStrength = () => {
    if (password.length === 0) return { label: '', color: 'transparent', width: 0 };
    if (password.length < 4) return { label: 'Weak', color: '#EF4444', width: 25 };
    if (password.length < 6) return { label: 'Fair', color: '#F59E0B', width: 50 };
    if (password.length < 8) return { label: 'Good', color: '#3B82F6', width: 75 };
    return { label: 'Strong', color: '#10B981', width: 100 };
  };
  const strength = getPasswordStrength();

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
              <Text style={styles.subtitle}>Start building better habits today</Text>
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
                  {/* Name */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.fieldLabel}>Full Name</Text>
                    <View style={styles.inputWrapper}>
                      <User size={20} color="#94A3B8" style={styles.inputIcon} strokeWidth={1.8} />
                      <TextInput
                        style={styles.input}
                        placeholder="John Doe"
                        placeholderTextColor="#CBD5E1"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
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
                      />
                      <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        {showPassword ? <EyeOff size={20} color="#94A3B8" strokeWidth={1.8} /> : <Eye size={20} color="#94A3B8" strokeWidth={1.8} />}
                      </TouchableOpacity>
                    </View>
                    {/* Password strength bar */}
                    {password.length > 0 && (
                      <View style={styles.strengthContainer}>
                        <View style={styles.strengthTrack}>
                          <Animated.View
                            style={[
                              styles.strengthFill,
                              { width: `${strength.width}%`, backgroundColor: strength.color },
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
                      />
                      {confirmPassword.length > 0 && (
                        password === confirmPassword
                          ? <CheckCircle2 size={20} color="#10B981" strokeWidth={2} />
                          : <XCircle size={20} color="#EF4444" strokeWidth={2} />
                      )}
                    </View>
                  </View>
                </View>

                {/* Create Account Button */}
                <Animated.View style={{ transform: [{ scale: buttonScale }], width: '100%' }}>
                  <TouchableOpacity
                    style={styles.buttonContainer}
                    onPress={handleSignUp}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    activeOpacity={1}
                  >
                    <LinearGradient
                      colors={['#34D399', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.button}
                    >
                      <Text style={styles.buttonText}>Create Account</Text>
                      <ArrowRight size={20} color="#FFF" strokeWidth={2.5} />
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
              <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
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
