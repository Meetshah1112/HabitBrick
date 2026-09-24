/**
 * Find people, answer requests, manage friends and blocks.
 *
 * Destructive actions (remove, block) confirm inline rather than through
 * Alert.alert, which is a no-op on web.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Search } from 'lucide-react-native';
import type { Friend, ProfileSummary } from '../../types/social';
import type { BlockedUser } from '../../api/socialService';
import type { LoadStatus } from '../../store/socialSlice';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS, SHADOWS } from '../../constants/theme';
import InitialsAvatar from './InitialsAvatar';

const SEARCH_DEBOUNCE_MS = 350;
const MIN_SEARCH_LENGTH = 3;

interface FriendsPanelProps {
  friends: readonly Friend[];
  blocked: readonly BlockedUser[];
  searchResults: readonly ProfileSummary[];
  searchStatus: LoadStatus;
  busy: readonly string[];
  onSearch: (query: string) => void;
  onClearSearch: () => void;
  onAdd: (userId: string) => void;
  onAnswer: (friendshipId: string, accept: boolean) => void;
  onRemove: (friendshipId: string) => void;
  onBlock: (userId: string) => void;
  onUnblock: (userId: string) => void;
}

type Confirming = { id: string; action: 'remove' | 'block' } | null;

function PersonRow({ person, children }: { person: ProfileSummary; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <InitialsAvatar name={person.displayName || person.username} seed={person.username} size={40} />
      <View style={styles.rowText}>
        <Text style={styles.name} numberOfLines={1}>
          {person.displayName || person.username}
        </Text>
        <Text style={styles.handle} numberOfLines={1}>
          @{person.username}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

function Pill({ label, onPress, tone = 'neutral', disabled }: {
  label: string;
  onPress?: () => void;
  tone?: 'primary' | 'neutral' | 'danger';
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, tone === 'primary' && styles.pillPrimary, tone === 'danger' && styles.pillDanger, disabled && styles.pillDisabled]}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || !onPress }}
    >
      <Text style={[styles.pillText, tone === 'primary' && styles.pillTextPrimary, tone === 'danger' && styles.pillTextDanger]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function FriendsPanel(props: FriendsPanelProps) {
  const { friends, blocked, searchResults, searchStatus, busy } = props;
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState<Confirming>(null);

  const { onSearch, onClearSearch } = props;
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SEARCH_LENGTH) {
      onClearSearch();
      return;
    }
    const timer = setTimeout(() => onSearch(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onSearch, onClearSearch]);

  const isBusy = (id: string) => busy.includes(id);
  const incoming = friends.filter((f) => f.status === 'pending' && f.isIncoming);
  const outgoing = friends.filter((f) => f.status === 'pending' && !f.isIncoming);
  const accepted = friends.filter((f) => f.status === 'accepted');
  const relationTo = (userId: string) => friends.find((f) => f.profile.id === userId);

  const searchAction = (person: ProfileSummary) => {
    const relation = relationTo(person.id);
    if (relation?.status === 'accepted') return <Pill label="Friends" />;
    if (relation && !relation.isIncoming) return <Pill label="Requested" />;
    if (relation?.isIncoming) {
      return <Pill label="Accept" tone="primary" disabled={isBusy(relation.friendshipId)} onPress={() => props.onAnswer(relation.friendshipId, true)} />;
    }
    return <Pill label="Add" tone="primary" disabled={isBusy(person.id)} onPress={() => props.onAdd(person.id)} />;
  };

  return (
    <View style={styles.panel}>
      <View style={styles.searchBox}>
        <Search size={18} color={COLORS.textMuted} strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Find friends by username"
          placeholderTextColor={COLORS.textPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Find friends by username"
        />
        {searchStatus === 'loading' && <ActivityIndicator size="small" color={COLORS.textMuted} />}
      </View>

      {query.trim().length >= MIN_SEARCH_LENGTH && (
        <Section title="Search">
          {searchResults.length === 0 && searchStatus === 'ready' ? (
            <Text style={styles.muted}>No one found with a username starting "{query.trim()}".</Text>
          ) : (
            searchResults.map((person) => (
              <PersonRow key={person.id} person={person}>
                {searchAction(person)}
              </PersonRow>
            ))
          )}
        </Section>
      )}

      {incoming.length > 0 && (
        <Section title={`Requests (${incoming.length})`}>
          {incoming.map((f) => (
            <PersonRow key={f.friendshipId} person={f.profile}>
              <Pill label="Accept" tone="primary" disabled={isBusy(f.friendshipId)} onPress={() => props.onAnswer(f.friendshipId, true)} />
              <Pill label="Decline" disabled={isBusy(f.friendshipId)} onPress={() => props.onAnswer(f.friendshipId, false)} />
            </PersonRow>
          ))}
        </Section>
      )}

      <Section title={`Friends (${accepted.length})`}>
        {accepted.length === 0 && <Text style={styles.muted}>Search for a username above to add your first friend.</Text>}
        {accepted.map((f) => {
          const confirmingThis = confirming?.id === f.friendshipId;
          return (
            <PersonRow key={f.friendshipId} person={f.profile}>
              {confirmingThis ? (
                <>
                  <Pill label="Cancel" onPress={() => setConfirming(null)} />
                  <Pill
                    label={confirming.action === 'remove' ? 'Remove' : 'Block'}
                    tone="danger"
                    disabled={isBusy(f.friendshipId) || isBusy(f.profile.id)}
                    onPress={() => {
                      setConfirming(null);
                      if (confirming.action === 'remove') props.onRemove(f.friendshipId);
                      else props.onBlock(f.profile.id);
                    }}
                  />
                </>
              ) : (
                <>
                  <Pill label="Remove" onPress={() => setConfirming({ id: f.friendshipId, action: 'remove' })} />
                  <Pill label="Block" tone="danger" onPress={() => setConfirming({ id: f.friendshipId, action: 'block' })} />
                </>
              )}
            </PersonRow>
          );
        })}
      </Section>

      {outgoing.length > 0 && (
        <Section title="Sent">
          {outgoing.map((f) => (
            <PersonRow key={f.friendshipId} person={f.profile}>
              <Pill label="Cancel" disabled={isBusy(f.friendshipId)} onPress={() => props.onRemove(f.friendshipId)} />
            </PersonRow>
          ))}
        </Section>
      )}

      {blocked.length > 0 && (
        <Section title="Blocked">
          {blocked.map((b) => (
            <PersonRow key={b.userId} person={{ id: b.userId, username: b.username, displayName: b.displayName, avatarUrl: null }}>
              <Pill label="Unblock" disabled={isBusy(b.userId)} onPress={() => props.onUnblock(b.userId)} />
            </PersonRow>
          ))}
        </Section>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: SPACING.xl,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    ...SHADOWS.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    color: COLORS.textPrimary,
    padding: 0,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionBody: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    ...SHADOWS.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.lg,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  handle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textTertiary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillPrimary: {
    backgroundColor: '#E86E3C',
    borderColor: '#E86E3C',
  },
  pillDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  pillDisabled: {
    opacity: 0.5,
  },
  pillText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  pillTextPrimary: {
    color: COLORS.white,
  },
  pillTextDanger: {
    color: COLORS.accentRedDark,
  },
  muted: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textTertiary,
    paddingVertical: SPACING.lg,
  },
});
