import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { Check, Lock } from 'lucide-react-native';

import type { RootState } from '../store/store';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../constants/theme';
import {
  countTotalBricks,
  decomposeBricks,
  getTierProgress,
  TIERS,
  BRICKS_PER_HOUSE,
  BRICKS_PER_ROOM,
  BRICKS_PER_WALL,
} from '../utils/bricks';

// ───────────────────────────────────────────────────────────────────────────
// Visual constants — calibrated to feel like a real masonry scene at phone size
// ───────────────────────────────────────────────────────────────────────────
const BRICK_W = 18;
const BRICK_H = 8;
const BRICK_GAP = 1.5;
const BRICK_COLOR = '#C84B1F';        // deeper terracotta than the brand orange
const BRICK_COLOR_SHADE = '#A23816';  // shadow / mortar shade
const MORTAR = '#F1ECE2';             // matches gradientStart so gaps read as paper

const SCENE_BG_SKY = '#EFE9DC';
const SCENE_BG_GROUND = '#E0D8C7';
const SCENE_HORIZON = '#D6CCB6';

// ───────────────────────────────────────────────────────────────────────────
// Atomic primitives — these get composed into walls, rooms, houses, scenes
// ───────────────────────────────────────────────────────────────────────────

/** A single brick. Slightly darker bottom edge gives it a baked-clay feel. */
function Brick({ half = false }: { half?: boolean }) {
  return (
    <View
      style={{
        width: half ? BRICK_W / 2 - BRICK_GAP / 2 : BRICK_W,
        height: BRICK_H,
        marginRight: BRICK_GAP,
        backgroundColor: BRICK_COLOR,
        borderBottomColor: BRICK_COLOR_SHADE,
        borderBottomWidth: 1,
        borderRadius: 1.5,
      }}
    />
  );
}

/**
 * A 10-brick wall in 5×2 running bond.
 * Row 1: 5 bricks · Row 2: half-brick, 4 bricks, half-brick (the classic offset).
 */
function Wall() {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <View style={{ flexDirection: 'row' }}>
        <Brick /><Brick /><Brick /><Brick /><Brick />
      </View>
      <View style={{ flexDirection: 'row', marginTop: BRICK_GAP }}>
        <Brick half /><Brick /><Brick /><Brick /><Brick /><Brick half />
      </View>
    </View>
  );
}

/**
 * A "room" — 4 walls' worth (40 bricks) shown as a small house-shape:
 * trapezoid roof + door + window. Compresses 100 bricks into one icon so
 * the scene stays readable at high counts.
 */
function RoomTile() {
  return (
    <View style={styles.roomTile}>
      {/* Roof */}
      <View style={styles.roomRoof} />
      {/* Body */}
      <View style={styles.roomBody}>
        <View style={styles.roomDoor} />
        <View style={styles.roomWindow} />
      </View>
    </View>
  );
}

/** A larger house — represents a completed 1000-brick milestone. */
function HouseTile() {
  return (
    <View style={styles.houseTile}>
      <View style={styles.houseRoof} />
      <View style={styles.houseBody}>
        <View style={styles.houseDoor} />
        <View style={styles.houseWindowRow}>
          <View style={styles.houseWindow} />
          <View style={styles.houseWindow} />
        </View>
      </View>
    </View>
  );
}

/** Decorative tree — appears once the user reaches the Garden tier. */
function Tree() {
  return (
    <View style={styles.tree}>
      <View style={styles.treeCanopy} />
      <View style={styles.treeTrunk} />
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Scene composer — chooses what to render based on the decomposition
// ───────────────────────────────────────────────────────────────────────────

interface SceneProps {
  totalBricks: number;
  hasGarden: boolean;
}

function Scene({ totalBricks, hasGarden }: SceneProps) {
  const { houses, rooms, walls, looseBricks } = decomposeBricks(totalBricks);

  // Cap visible counts so the scene never overflows the card on big users.
  const visibleHouses = Math.min(houses, 5);
  const visibleRooms = Math.min(rooms, 9);
  const visibleWalls = Math.min(walls, 9);
  const visibleLoose = Math.min(looseBricks, 9);

  const showEmpty = totalBricks === 0;

  return (
    <View style={styles.scene}>
      {/* Sky */}
      <View style={styles.sceneSky}>
        {hasGarden && <View style={styles.sun} />}
      </View>

      {/* Horizon line */}
      <View style={styles.horizon} />

      {/* Ground with what's been built */}
      <View style={styles.sceneGround}>
        {showEmpty ? (
          <View style={styles.emptyPlot}>
            <Text style={styles.emptyPlotText}>Your land</Text>
          </View>
        ) : (
          <View style={styles.sceneRow}>
            {/* Houses on the left — biggest first */}
            {Array.from({ length: visibleHouses }).map((_, i) => (
              <HouseTile key={`h${i}`} />
            ))}

            {/* Rooms in the middle */}
            {Array.from({ length: visibleRooms }).map((_, i) => (
              <RoomTile key={`r${i}`} />
            ))}

            {/* Walls and loose bricks on the right — what's currently being built */}
            {(visibleWalls > 0 || visibleLoose > 0) && (
              <View style={styles.constructionZone}>
                {Array.from({ length: visibleWalls }).map((_, i) => (
                  <View key={`w${i}`} style={{ marginRight: SPACING.xs }}>
                    <Wall />
                  </View>
                ))}
                {visibleLoose > 0 && (
                  <View style={styles.looseBrickRow}>
                    {Array.from({ length: visibleLoose }).map((_, i) => (
                      <Brick key={`l${i}`} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Trees appear once the user has built a Garden */}
        {hasGarden && (
          <View style={styles.gardenRow}>
            <Tree />
            <Tree />
            <Tree />
          </View>
        )}
      </View>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main screen
// ───────────────────────────────────────────────────────────────────────────

export default function WorldScreen() {
  const habits = useSelector((s: RootState) => s.habits.habits);

  const totalBricks = useMemo(() => countTotalBricks(habits), [habits]);
  const tierProgress = useMemo(() => getTierProgress(totalBricks), [totalBricks]);
  const breakdown = useMemo(() => decomposeBricks(totalBricks), [totalBricks]);

  const { currentTier, nextTier, bricksToNext, progress } = tierProgress;
  const hasGarden = totalBricks >= 2000;

  // Entrance animation — counter pops in, progress bar fills.
  const counterScale = useRef(new Animated.Value(0.9)).current;
  const counterOpacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(counterScale, { toValue: 1, damping: 14, stiffness: 200, useNativeDriver: true }),
      Animated.timing(counterOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 900,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: false,
      }),
    ]).start();
  }, [progress, counterScale, counterOpacity, progressAnim]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header eyebrow */}
        <Text style={styles.eyebrow}>YOU'RE BUILDING A</Text>
        <Text style={styles.title}>{currentTier.label}</Text>

        {/* Big brick counter */}
        <Animated.View
          style={[
            styles.counterCard,
            { opacity: counterOpacity, transform: [{ scale: counterScale }] },
          ]}
        >
          <Text style={styles.counterValue}>{totalBricks.toLocaleString()}</Text>
          <Text style={styles.counterLabel}>BRICKS LAID</Text>

          {/* Sub-breakdown — gives weight to small wins early on */}
          <View style={styles.breakdownRow}>
            <Stat value={breakdown.houses} label="houses" />
            <Divider />
            <Stat value={breakdown.rooms} label="rooms" />
            <Divider />
            <Stat value={breakdown.walls} label="walls" />
          </View>
        </Animated.View>

        {/* Progress to next tier */}
        {nextTier ? (
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>
                Next: <Text style={styles.progressLabelBold}>{nextTier.label}</Text>
              </Text>
              <Text style={styles.progressRemaining}>
                {bricksToNext.toLocaleString()} to go
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressBarWidth }]} />
            </View>
          </View>
        ) : (
          <View style={styles.progressCard}>
            <Text style={styles.progressLabelBold}>You've reached the top tier.</Text>
            <Text style={styles.progressRemaining}>Every brick from here is pure legacy.</Text>
          </View>
        )}

        {/* The scene */}
        <Scene totalBricks={totalBricks} hasGarden={hasGarden} />

        {/* Conversion key — teaches the system without a popover */}
        <View style={styles.keyRow}>
          <KeyChip n={1} label="brick" />
          <KeyChip n={BRICKS_PER_WALL} label="wall" />
          <KeyChip n={BRICKS_PER_ROOM} label="room" />
          <KeyChip n={BRICKS_PER_HOUSE} label="house" />
        </View>

        {/* Milestones ladder */}
        <Text style={styles.ladderHeader}>Milestones</Text>
        <View style={styles.ladder}>
          {TIERS.map((tier) => {
            const reached = totalBricks >= tier.threshold;
            const isCurrent = tier.key === currentTier.key;
            return (
              <View
                key={tier.key}
                style={[
                  styles.ladderRow,
                  isCurrent && styles.ladderRowCurrent,
                ]}
              >
                <View
                  style={[
                    styles.ladderBadge,
                    reached ? styles.ladderBadgeReached : styles.ladderBadgeLocked,
                  ]}
                >
                  {reached ? (
                    <Check size={16} color="#FFFFFF" strokeWidth={3} />
                  ) : (
                    <Lock size={14} color={COLORS.textMuted} strokeWidth={2} />
                  )}
                </View>

                <View style={styles.ladderText}>
                  <View style={styles.ladderTitleRow}>
                    <Text
                      style={[
                        styles.ladderTitle,
                        !reached && styles.ladderTitleLocked,
                      ]}
                    >
                      {tier.label}
                    </Text>
                    <Text style={styles.ladderThreshold}>
                      {tier.threshold.toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.ladderDescription}>{tier.description}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Bottom-tab clearance */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Small inline components
// ───────────────────────────────────────────────────────────────────────────

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.statDivider} />;
}

function KeyChip({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.keyChip}>
      <Text style={styles.keyChipN}>{n.toLocaleString()}</Text>
      <Text style={styles.keyChipLabel}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Styles
// ───────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.gradientStart },
  scroll: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },

  // Header
  eyebrow: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: '#E86E3C',
    letterSpacing: 2.4,
    marginBottom: SPACING.xs,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#1F1D1B',
    letterSpacing: -0.6,
    marginBottom: SPACING.lg,
  },

  // Counter card
  counterCard: {
    backgroundColor: '#FCFAF6',
    borderRadius: BORDER_RADIUS.xxl,
    paddingVertical: SPACING.xxl,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
    ...SHADOWS.md,
  },
  counterValue: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '800',
    color: '#1F1D1B',
    letterSpacing: -2,
  },
  counterLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 2,
    marginTop: SPACING.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31, 29, 27, 0.08)',
    width: '100%',
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: FONT_SIZES.xl, fontWeight: '700', color: '#1F1D1B' },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(31, 29, 27, 0.08)',
  },

  // Progress card
  progressCard: {
    marginTop: SPACING.lg,
    backgroundColor: '#FCFAF6',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  progressLabel: { fontSize: FONT_SIZES.md, color: '#5A534B' },
  progressLabelBold: { fontWeight: '700', color: '#1F1D1B' },
  progressRemaining: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#E86E3C',
  },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(31, 29, 27, 0.08)',
    borderRadius: 9999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#E86E3C',
    borderRadius: 9999,
  },

  // Scene
  scene: {
    marginTop: SPACING.xl,
    height: 220,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  sceneSky: {
    height: 80,
    backgroundColor: SCENE_BG_SKY,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    padding: SPACING.md,
  },
  sun: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5C56A',
    opacity: 0.85,
  },
  horizon: {
    height: 1,
    backgroundColor: SCENE_HORIZON,
  },
  sceneGround: {
    flex: 1,
    backgroundColor: SCENE_BG_GROUND,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    justifyContent: 'flex-end',
  },
  sceneRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  constructionZone: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  looseBrickRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  emptyPlot: {
    height: 80,
    borderWidth: 1.5,
    borderColor: '#B7AC95',
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  emptyPlotText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: '#8C8268',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Room tile (~100 bricks)
  roomTile: {
    width: 36,
    alignItems: 'center',
  },
  roomRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 18,
    borderRightWidth: 18,
    borderBottomWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BRICK_COLOR_SHADE,
  },
  roomBody: {
    width: 36,
    height: 30,
    backgroundColor: BRICK_COLOR,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 4,
    flexDirection: 'row',
    gap: 4,
  },
  roomDoor: {
    width: 8,
    height: 14,
    backgroundColor: '#3F2A1F',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  roomWindow: {
    width: 6,
    height: 6,
    backgroundColor: '#F5C56A',
    marginBottom: 6,
  },

  // House tile (~1000 bricks)
  houseTile: {
    width: 56,
    alignItems: 'center',
  },
  houseRoof: {
    width: 0,
    height: 0,
    borderLeftWidth: 28,
    borderRightWidth: 28,
    borderBottomWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: BRICK_COLOR_SHADE,
  },
  houseBody: {
    width: 56,
    height: 46,
    backgroundColor: BRICK_COLOR,
    borderRadius: 2,
    alignItems: 'center',
    paddingTop: 6,
  },
  houseWindowRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  houseWindow: {
    width: 8,
    height: 8,
    backgroundColor: '#F5C56A',
  },
  houseDoor: {
    width: 10,
    height: 18,
    backgroundColor: '#3F2A1F',
    position: 'absolute',
    bottom: 0,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // Garden
  gardenRow: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: SPACING.lg,
  },
  tree: { alignItems: 'center' },
  treeCanopy: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#5B7A3D',
  },
  treeTrunk: {
    width: 3,
    height: 8,
    backgroundColor: '#5C3A20',
    marginTop: -2,
  },

  // Key chips
  keyRow: {
    flexDirection: 'row',
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  keyChip: {
    flex: 1,
    backgroundColor: '#FCFAF6',
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(31, 29, 27, 0.06)',
  },
  keyChipN: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '800',
    color: '#1F1D1B',
  },
  keyChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Ladder
  ladderHeader: {
    fontSize: FONT_SIZES.xs,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 2,
    marginTop: SPACING.xxl,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  ladder: { gap: SPACING.sm },
  ladderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FCFAF6',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  ladderRowCurrent: {
    borderWidth: 1.5,
    borderColor: '#E86E3C',
  },
  ladderBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ladderBadgeReached: { backgroundColor: '#E86E3C' },
  ladderBadgeLocked: { backgroundColor: 'rgba(31, 29, 27, 0.06)' },
  ladderText: { flex: 1 },
  ladderTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  ladderTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: '#1F1D1B',
  },
  ladderTitleLocked: { color: COLORS.textMuted },
  ladderThreshold: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  ladderDescription: {
    fontSize: FONT_SIZES.sm,
    color: '#5A534B',
    marginTop: 2,
    lineHeight: 18,
  },
});
