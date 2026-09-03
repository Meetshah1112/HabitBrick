import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/types';
import { COLORS, SPACING } from '../constants/theme';

type LegalScreenRouteProp = RouteProp<RootStackParamList, 'Legal'>;

export default function LegalScreen() {
  const navigation = useNavigation();
  const route = useRoute<LegalScreenRouteProp>();
  const { type } = route.params;

  const isTerms = type === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const lastUpdated = 'June 5, 2026';

  const renderContent = () => {
    if (isTerms) {
      return (
        <View style={styles.contentSection}>
          <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.paragraph}>
            By accessing and using HabitBrick, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the application.
          </Text>

          <Text style={styles.sectionTitle}>2. Use of the App</Text>
          <Text style={styles.paragraph}>
            HabitBrick is designed to help you track habits and improve consistency. There is no account or sign-in — the app runs entirely on your device, and you are responsible for the device it's installed on.
          </Text>

          <Text style={styles.sectionTitle}>3. User Data</Text>
          <Text style={styles.paragraph}>
            All of your habit data — habits, streaks, badges, and reminders — is stored locally on your device only. Nothing is transmitted to us or any third party, and we have no servers that store or process your data.
          </Text>

          <Text style={styles.sectionTitle}>4. Limitations of Liability</Text>
          <Text style={styles.paragraph}>
            HabitBrick is provided "as is" without any warranties. We are not liable for any data loss or personal injury resulting from the pursuit of habits tracked within the app.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.contentSection}>
        <Text style={styles.sectionTitle}>1. Data Collection</Text>
        <Text style={styles.paragraph}>
          HabitBrick does not have accounts and does not collect your name, email, location, or any other personal information. The habits, streaks, badges, and display name you enter are stored only in local storage on your own device.
        </Text>

        <Text style={styles.sectionTitle}>2. How We Use Data</Text>
        <Text style={styles.paragraph}>
          Everything you enter is used solely to run the app on your device — calculating streaks, unlocking badges, and building your Brick World. Since nothing is transmitted, there is no analytics, tracking, or aggregation of any kind.
        </Text>

        <Text style={styles.sectionTitle}>3. Notifications</Text>
        <Text style={styles.paragraph}>
          Habit reminders are scheduled directly on your device using your phone's own notification system. No reminder content or scheduling data ever leaves your device.
        </Text>

        <Text style={styles.sectionTitle}>4. Your Rights</Text>
        <Text style={styles.paragraph}>
          Use "Reset Progress" in your profile to permanently erase all local data at any time, or simply uninstall the app — since nothing exists outside your device, there is nothing left behind.
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Dynamic Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color="#1E293B" strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <Text style={styles.mainTitle}>{title}</Text>
          <View style={styles.divider} />
          <Text style={styles.lastUpdatedText}>Last Updated: {lastUpdated}</Text>
        </View>

        {renderContent()}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 HabitBrick. All rights reserved.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F2',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 60,
  },
  titleSection: {
    marginBottom: 32,
  },
  mainTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  divider: {
    width: 60,
    height: 4,
    backgroundColor: '#FF9A62',
    borderRadius: 2,
    marginBottom: 12,
  },
  lastUpdatedText: {
    fontSize: 14,
    color: '#94A3B8',
    fontWeight: '600',
  },
  contentSection: {
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: '#64748B',
    lineHeight: 24,
    fontWeight: '500',
  },
  footer: {
    marginTop: 60,
    alignItems: 'center',
    paddingTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  footerText: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
