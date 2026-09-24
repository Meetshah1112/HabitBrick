/**
 * Friends' milestones, newest first, with a clap on each.
 *
 * Every item is rendered through describeActivity(), which builds the text
 * from this app's own tables. Anything it cannot vouch for (an unknown badge,
 * a malformed number) is simply not shown.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import type { ActivityEvent } from '../../types/social';
import { describeActivity } from '../../social/milestones';
import { formatSyncTime } from '../../utils/formatSyncTime';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import InitialsAvatar from './InitialsAvatar';

interface FeedListProps {
  events: readonly ActivityEvent[];
  myUserId: string | null;
  hasMore: boolean;
  isLoading: boolean;
  onClap: (event: ActivityEvent) => void;
  onLoadMore: () => void;
}

function FeedItem({ event, isMine, onClap }: { event: ActivityEvent; isMine: boolean; onClap: () => void }) {
  const described = describeActivity(event.type, event.payload);
  if (!described) return null;
  const name = isMine ? 'You' : event.displayName || `@${event.username}`;

  return (
    <View style={styles.card}>
      <InitialsAvatar name={event.displayName || event.username} seed={event.username} size={40} />
      <View style={styles.body}>
        <Text style={styles.text}>
          <Text style={styles.name}>{name}</Text> {described.text} {described.emoji}
        </Text>
        <Text style={styles.time}>{formatSyncTime(event.createdAt)}</Text>
      </View>
      <TouchableOpacity
        style={[styles.clap, event.iClapped && styles.clapActive]}
        onPress={onClap}
        accessibilityRole="button"
        accessibilityLabel={event.iClapped ? 'Remove your clap' : 'Clap'}
        accessibilityState={{ selected: event.iClapped }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.clapEmoji}>👏</Text>
        {event.clapCount > 0 && (
          <Text style={[styles.clapCount, event.iClapped && styles.clapCountActive]}>{event.clapCount}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function FeedList({ events, myUserId, hasMore, isLoading, onClap, onLoadMore }: FeedListProps) {
  if (isLoading && events.length === 0) {
    return <ActivityIndicator style={styles.loading} color={COLORS.accentOrange} />;
  }
  if (events.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No milestones yet</Text>
        <Text style={styles.emptyText}>
          When you or your friends hit a streak, lay a hundred bricks or unlock a badge, it shows up
          here. Habit names are never shared.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {events.map((event) => (
        <FeedItem key={event.id} event={event} isMine={event.userId === myUserId} onClap={() => onClap(event)} />
      ))}
      {hasMore && (
        <TouchableOpacity style={styles.more} onPress={onLoadMore} accessibilityRole="button">
          <Text style={styles.moreText}>Show older</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: SPACING.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.sm,
  },
  body: {
    flex: 1,
  },
  text: {
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  name: {
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  time: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  clap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  clapActive: {
    backgroundColor: '#FFF1E6',
    borderColor: '#FDDCB5',
  },
  clapEmoji: {
    fontSize: 16,
  },
  clapCount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textTertiary,
  },
  clapCountActive: {
    color: COLORS.accentOrange,
  },
  loading: {
    marginTop: SPACING.xxxl,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT_SIZES.md,
    lineHeight: 20,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },
  more: {
    alignSelf: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  moreText: {
    fontSize: FONT_SIZES.md,
    fontWeight: '600',
    color: COLORS.accentOrange,
  },
});
