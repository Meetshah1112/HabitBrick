import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { CheckCircle2, Flame, Lock } from 'lucide-react-native';
import { CategoryIcon } from './CategoryIcon';
import { COLORS, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import { Habit, CATEGORY_CONFIG } from '../types';

const getHoleColor = (baseColor: string, opacity: number) => {
  // Simple darkening logic: since notes are light/pastels, we use dark brown/grey overlays
  return `rgba(60, 40, 30, ${opacity})`; 
};

interface StickyNoteProps {
  habit: Habit;
  onPress: (id: string) => void;
  rotation?: number;
  animatePin?: boolean;
  isScheduledToday?: boolean;
}

export default function StickyNote({
  habit,
  onPress,
  rotation = 0,
  animatePin = false,
  isScheduledToday = true,
}: StickyNoteProps) {
  const config = CATEGORY_CONFIG[habit.category];
  const isCompleted = habit.completedToday;
  const isLocked = !isScheduledToday && !isCompleted;

  const pinScale = useRef(new Animated.Value(isCompleted && !animatePin ? 1 : 0)).current;

  useEffect(() => {
    if (animatePin && isCompleted) {
      pinScale.setValue(0);
      Animated.sequence([
        Animated.timing(pinScale, { toValue: 1.4, duration: 250, useNativeDriver: true }),
        Animated.spring(pinScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      ]).start();
    } else if (isCompleted) {
      pinScale.setValue(1);
    } else {
      pinScale.setValue(0);
    }
  }, [animatePin, isCompleted]);

  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (isLocked) return;
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 20 }).start();
  };

  const handlePressOut = () => {
    if (isLocked) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  };

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ rotate: `${rotation}deg` }, { scale }] }]}>
      <Pressable
        onPress={() => !isLocked && onPress(habit.id)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [
          styles.pressableArea,
          pressed && !isLocked && { opacity: 0.95 },
        ]}
      >
        {/* ── LOCKED OVERLAY ── */}
        {isLocked && (
          <View style={styles.lockedOverlay}>
            <View style={styles.lockedBadge}>
              <Lock size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.lockedText}>Rest Day</Text>
            </View>
          </View>
        )}

        <View
          style={[
            styles.note,
            { backgroundColor: isLocked ? '#E5E7EB' : config.stickyColor },
            isLocked && styles.noteLocked,
          ]}
        >
          {/* Pushpin Realism Layer - Pierce Point & 3D Shadow */}
          <Animated.View style={[styles.redPin, isCompleted && { transform: [{ scale: pinScale }] }]}>
            {/* Indentation Shadow (simulates paper being pressed in) */}
            <View style={[styles.pinIndentation, { backgroundColor: getHoleColor(config.stickyColor, 0.1) }]} />
            
            {/* Pinhole Depth Shadow (Top edge of the hole) */}
            <View style={[styles.pinHole, { backgroundColor: getHoleColor(config.stickyColor, 0.3) }]} />
            
            {/* Light Rim (Bottom edge of the hole reflecting light) */}
            <View style={[styles.pinHoleRim, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />

            <View style={styles.pinImageContainer}>
              <Image
                source={require('../../assets/pushpin.png')}
                style={[styles.pinImage, isLocked && styles.pinImageLocked]}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* Streak badge Top Right */}
          <View style={styles.streakBadge}>
            <Flame
              size={11}
              color={isLocked ? '#9CA3AF' : '#EA580C'}
              strokeWidth={2}
              fill={isLocked ? '#D1D5DB' : '#FDBA74'}
            />
            <Text style={[styles.streakText, isLocked && styles.streakTextLocked]}>
              {habit.currentStreak}
            </Text>
          </View>

          {/* Center icon */}
          <View style={styles.centerIconContainer}>
            <View style={[styles.iconCircle, isLocked && styles.iconCircleLocked]}>
              {isLocked ? (
                <Lock size={26} color="#9CA3AF" strokeWidth={1.8} />
              ) : isCompleted ? (
                <CheckCircle2 size={32} color="#4ADE80" strokeWidth={2} />
              ) : (
                <CategoryIcon
                  category={habit.category}
                  size={28}
                  color={config.textColor}
                  strokeWidth={2}
                />
              )}
            </View>
          </View>

          {/* Title and status */}
          <View style={styles.textContainer}>
            <Text
              style={[
                styles.title,
                isCompleted && styles.strikethrough,
                isLocked && styles.titleLocked,
              ]}
              numberOfLines={1}
            >
              {habit.title}
            </Text>
            <Text
              style={[
                styles.status,
                {
                  color: isLocked
                    ? '#9CA3AF'
                    : isCompleted
                    ? COLORS.statusDone
                    : config.textColor,
                  opacity: 0.7,
                },
              ]}
            >
              {isLocked ? 'Not today' : isCompleted ? 'Done' : habit.description || 'Routine'}
            </Text>
          </View>

          {/* Inner highlight */}
          <View style={styles.innerHighlight} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '47%',
    marginBottom: 4,
  },
  pressableArea: {
    flex: 1,
  },
  note: {
    borderRadius: BORDER_RADIUS.md,
    padding: 16,
    paddingBottom: 16,
    paddingTop: 28,          // extra top space so the pin sits inside the card
    minHeight: 150,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'transparent',
    ...SHADOWS.md,
  },
  noteLocked: {
    borderColor: 'transparent',
    opacity: 0.75,
  },
  lockedOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(75,85,99,0.82)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lockedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  redPin: {
    position: 'absolute',
    top: -17,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -16,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
  },
  pinImageContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 4,
    elevation: 6,
  },
  pinImage: {
    width: 32,
    height: 32,
  },
  pinHole: {
    position: 'absolute',
    bottom: 7,
    width: 3.5,
    height: 1.4,
    borderRadius: 2,
    zIndex: -1,
  },
  pinHoleRim: {
    position: 'absolute',
    bottom: 6.6,
    width: 4.2,
    height: 0.6,
    borderRadius: 1,
    zIndex: -1,
  },
  pinIndentation: {
    position: 'absolute',
    bottom: 4,
    width: 10,
    height: 5,
    borderRadius: 6,
    zIndex: -2,
    transform: [{ scaleX: 1.1 }],
    opacity: 0.5,
  },
  pinImageLocked: {
    opacity: 0.35,
    tintColor: '#9CA3AF',
  },
  streakBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 5,
  },
  streakText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#737373',
  },
  streakTextLocked: {
    color: '#9CA3AF',
  },
  centerIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleLocked: {
    backgroundColor: 'rgba(156,163,175,0.2)',
  },
  textContainer: {
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    textAlign: 'center',
  },
  titleLocked: {
    color: '#6B7280',
  },
  strikethrough: {
    textDecorationLine: 'line-through',
    textDecorationStyle: 'solid',
    opacity: 0.5,
  },
  status: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  innerHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderTopLeftRadius: BORDER_RADIUS.md,
    borderTopRightRadius: BORDER_RADIUS.md,
  },
});
