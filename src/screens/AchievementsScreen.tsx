import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useIsFocused } from '@react-navigation/native';
import { markBadgesSeen } from '../store/habitSlice';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot, { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  Star, Flame, Trophy, Award, Target, Zap, Shield, ShieldCheck,
  Sun, Moon, Calendar, Check, CheckCheck, Activity, TrendingUp,
  BookOpen, Leaf, Brain, Users, Heart, Sparkles, Rocket, Crown,
  Lock, Share2, Gift, Layers, Package, X,
} from 'lucide-react-native';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../constants/theme';
import { useHabitStore } from '../store/habitStore';
import { Badge } from '../types';

// ─── Icon Mapping ──────────────────────────────────────────────────────────────
const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Star, Flame, Trophy, Award, Target, Zap, Shield, ShieldCheck,
  Sun, Moon, Calendar, Check, CheckCheck, Activity, TrendingUp,
  BookOpen, Leaf, Brain, Users, Heart, Sparkles, Rocket, Crown,
  Lock, Gift, Layers, Package,
};

function BadgeIcon({ icon, size, color }: { icon: string; size: number; color: string }) {
  const LucideIcon = ICON_MAP[icon] ?? Star;
  return <LucideIcon size={size} color={color} strokeWidth={2} />;
}

// ─── Colour accent per badge category ─────────────────────────────────────────
function getBadgeAccent(icon: string): { bg: string; border: string; iconColor: string } {
  if (['Flame', 'Trophy', 'Shield', 'Award', 'Target', 'Crown', 'ShieldCheck', 'Rocket'].includes(icon))
    return { bg: '#FFFBEB', border: '#FDE68A', iconColor: '#D97706' };
  if (['Heart', 'Leaf', 'Sparkles', 'Users', 'Brain'].includes(icon))
    return { bg: '#F0FDF4', border: '#BBF7D0', iconColor: '#059669' };
  if (['Star', 'Zap', 'Layers', 'Package', 'Gift'].includes(icon))
    return { bg: '#EFF6FF', border: '#BFDBFE', iconColor: '#2563EB' };
  if (['TrendingUp', 'Activity', 'Check', 'CheckCheck'].includes(icon))
    return { bg: '#F5F3FF', border: '#DDD6FE', iconColor: '#7C3AED' };
  if (['Sun', 'Moon', 'Calendar', 'BookOpen'].includes(icon))
    return { bg: '#FFF1F2', border: '#FECDD3', iconColor: '#E11D48' };
  return { bg: '#F9FAFB', border: '#E5E7EB', iconColor: '#6B7280' };
}

export default function AchievementsScreen() {
  const { badges } = useHabitStore();
  const dispatch = useDispatch();
  const isFocused = useIsFocused();
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const viewShotRef = React.useRef<any>(null);

  useEffect(() => {
    if (isFocused) {
      dispatch(markBadgesSeen());
    }
  }, [isFocused]);

  const unlockedCount = badges.filter((b) => b.unlocked).length;
  const totalCount = badges.length;
  const progressPercent = totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0;

  const handleShare = async () => {
    if (!selectedBadge || !viewShotRef.current) return;
    
    setIsSharing(true);
    try {
      const uri = await captureRef(viewShotRef.current, {
        format: 'png',
        quality: 1,
      });

      if (!(await Sharing.isAvailableAsync())) {
        // Fallback to text
        await Share.share({
          message: `I just earned the "${selectedBadge.title}" badge on HabitBrick! 🏆\n\n${selectedBadge.description}\n\nJoin me in building better habits! #HabitBrick #Consistency`,
        });
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: `Share my "${selectedBadge.title}" achievement!`,
        UTI: 'public.png',
      });
    } catch (error) {
      console.error('Sharing failed:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const closeModal = () => setSelectedBadge(null);

  const unlockedBadges = badges.filter((b) => b.unlocked);
  const lockedBadges = badges.filter((b) => !b.unlocked);

  return (
    <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Achievements</Text>
          <View style={styles.countPill}>
            <Trophy size={14} color="#D97706" strokeWidth={2} />
            <Text style={styles.countPillText}>{unlockedCount}/{totalCount}</Text>
          </View>
        </View>

        {/* ── Progress Bar ── */}
        <View style={styles.progressSection}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{Math.round(progressPercent)}% Unlocked</Text>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Unlocked ── */}
          {unlockedBadges.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✨ Unlocked</Text>
              <View style={styles.grid}>
                {unlockedBadges.map((badge) => {
                  const accent = getBadgeAccent(badge.icon);
                  return (
                    <TouchableOpacity
                      key={badge.id}
                      style={styles.card}
                      activeOpacity={0.8}
                      onPress={() => setSelectedBadge(badge)}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: accent.bg, borderColor: accent.border }]}>
                        <BadgeIcon icon={badge.icon} size={28} color={accent.iconColor} />
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>{badge.title}</Text>
                      <View style={styles.shareRow}>
                        <Share2 size={10} color={COLORS.textMuted} strokeWidth={2} />
                        <Text style={styles.shareText}>Share</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Locked ── */}
          <Text style={[styles.sectionTitle, unlockedBadges.length > 0 && { marginTop: SPACING.xxl }]}>
            🔒 Locked
          </Text>
          <View style={styles.grid}>
            {lockedBadges.map((badge) => (
              <TouchableOpacity
                key={badge.id}
                style={styles.card}
                activeOpacity={0.8}
                onPress={() => setSelectedBadge(badge)}
              >
                <View style={[styles.iconCircle, styles.iconCircleLocked]}>
                  <BadgeIcon icon={badge.icon} size={28} color="#D1D5DB" />
                  <View style={styles.lockDot}>
                    <Lock size={10} color="#6B7280" strokeWidth={2.5} />
                  </View>
                </View>
                <Text style={[styles.cardTitle, styles.cardTitleLocked]} numberOfLines={2}>
                  {badge.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* ── Badge Detail Modal ── */}
        <Modal visible={!!selectedBadge} transparent animationType="fade" onRequestClose={closeModal}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={closeModal}>
            <TouchableOpacity activeOpacity={1} style={styles.modalCard}>
              {selectedBadge && (() => {
                const accent = getBadgeAccent(selectedBadge.icon);
                const isUnlocked = selectedBadge.unlocked;
                return (
                  <>
                    {/* Close */}
                    <TouchableOpacity style={styles.modalClose} onPress={closeModal}>
                      <X size={18} color={COLORS.textMuted} strokeWidth={2} />
                    </TouchableOpacity>

                    {/* Shareable Card Area */}
                    <View 
                      ref={viewShotRef} 
                      collapsable={false} 
                      style={styles.shareableWrapper}
                    >
                      <LinearGradient
                        colors={['#FFFFFF', '#FAF7F2']}
                        style={styles.shareableCard}
                      >
                        {/* Branding */}
                        <View style={styles.shareBranding}>
                          <Text style={styles.shareBrandName}>HabitBrick</Text>
                          <Award size={14} color="#FF9A62" strokeWidth={2.5} />
                        </View>

                        {/* Icon */}
                        <View style={[
                          styles.modalIconCircle,
                          isUnlocked
                            ? { backgroundColor: accent.bg, borderColor: accent.border }
                            : styles.iconCircleLocked,
                        ]}>
                          <BadgeIcon
                            icon={selectedBadge.icon}
                            size={48}
                            color={isUnlocked ? accent.iconColor : '#D1D5DB'}
                          />
                        </View>

                        <Text style={styles.modalTitle}>{selectedBadge.title}</Text>
                        <Text style={styles.modalDesc}>{selectedBadge.description}</Text>
                        
                        {isUnlocked && (
                          <Text style={styles.modalDate}>
                            Earned{' '}
                            {new Date(selectedBadge.unlockedAt!).toLocaleDateString('en-US', {
                              month: 'long', day: 'numeric', year: 'numeric',
                            })}
                          </Text>
                        )}
                      </LinearGradient>
                    </View>

                    {isUnlocked ? (
                      <TouchableOpacity 
                        style={[styles.shareButton, isSharing && { opacity: 0.7 }]} 
                        onPress={handleShare}
                        disabled={isSharing}
                      >
                        <Share2 size={16} color="#fff" strokeWidth={2} />
                        <Text style={styles.shareButtonText}>
                          {isSharing ? 'Generating Image...' : 'Share Visual Badge'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.requirementBox}>
                        <Text style={styles.requirementLabel}>How to unlock</Text>
                        <Text style={styles.requirementText}>{selectedBadge.requirement}</Text>
                      </View>
                    )}
                  </>
                );
              })()}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#212121',
    letterSpacing: -0.5,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  countPillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: '#92400E',
  },

  progressSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 6,
  },
  progressBarBg: {
    height: 7,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: 120,
  },

  sectionTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.lg,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  card: {
    width: '30%',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  iconCircleLocked: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  lockDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
    lineHeight: 15,
  },
  cardTitleLocked: {
    color: COLORS.textMuted,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  shareText: {
    fontSize: 9,
    color: COLORS.textMuted,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xxxl,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xxxl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    gap: SPACING.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    padding: 4,
  },
  modalIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    marginBottom: SPACING.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  modalLockDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalDate: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#10B981',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.xxl,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  shareButtonText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '700',
    color: '#fff',
  },
  requirementBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    width: '100%',
    gap: 4,
  },
  requirementLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#92400E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requirementText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  shareableWrapper: {
    backgroundColor: '#FAF7F2',
    padding: 10,
    borderRadius: BORDER_RADIUS.xl,
    width: '110%', // slightly larger to capture well
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  shareableCard: {
    padding: 30,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(230, 92, 25, 0.1)',
  },
  shareBranding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  shareBrandName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E86E3C',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});
