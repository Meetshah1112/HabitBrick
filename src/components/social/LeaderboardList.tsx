/**
 * This week's bricks among you and your friends. Counts only — the database
 * function behind it never returns a habit title (see 0003_functions.sql).
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { LeaderboardRow } from '../../types/social';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import InitialsAvatar from './InitialsAvatar';

interface LeaderboardListProps {
  rows: readonly LeaderboardRow[];
  myUserId: string | null;
  isLoading: boolean;
}

const MEDALS = ['🥇', '🥈', '🥉'];

export default function LeaderboardList({ rows, myUserId, isLoading }: LeaderboardListProps) {
  if (isLoading && rows.length === 0) {
    return <ActivityIndicator style={styles.loading} color={COLORS.accentOrange} />;
  }

  return (
    <View style={styles.list}>
      <Text style={styles.caption}>Bricks laid since Monday</Text>
      {rows.map((row, index) => {
        const isMe = row.userId === myUserId;
        const name = isMe ? 'You' : row.displayName || `@${row.username}`;
        return (
          <View key={row.userId} style={[styles.row, isMe && styles.rowMe]}>
            <Text style={styles.rank}>{MEDALS[index] ?? `${index + 1}`}</Text>
            <InitialsAvatar name={row.displayName || row.username} seed={row.username} size={36} />
            <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.bricks}>🧱 {row.bricks.toLocaleString()}</Text>
          </View>
        );
      })}
      {rows.length <= 1 && (
        <Text style={styles.hint}>Add friends to see how your week compares.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.sm,
  },
  caption: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '600',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.sm,
  },
  rowMe: {
    borderWidth: 2,
    borderColor: '#FDDCB5',
  },
  rank: {
    width: 28,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textAlign: 'center',
  },
  name: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  nameMe: {
    color: COLORS.accentOrange,
  },
  bricks: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  hint: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  loading: {
    marginTop: SPACING.xxxl,
  },
});
