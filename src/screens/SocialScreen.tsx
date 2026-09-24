/**
 * Social: friends' milestones, this week's leaderboard, and friends.
 * Opened from the people icon on the Home header.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDispatch, useSelector } from 'react-redux';
import { ArrowLeft, Users } from 'lucide-react-native';
import type { RootStackParamList } from '../navigation/types';
import type { AppDispatch, RootState } from '../store/store';
import {
  addFriend,
  answerRequest,
  block,
  loadFeed,
  loadFriends,
  loadLeaderboard,
  loadMoreFeed,
  removeFriend,
  searchCleared,
  searchPeople,
  selectIncomingRequestCount,
  socialErrorDismissed,
  toggleClap,
  unblock,
} from '../store/socialSlice';
import type { ActivityEvent } from '../types/social';
import SegmentedControl from '../components/social/SegmentedControl';
import FeedList from '../components/social/FeedList';
import LeaderboardList from '../components/social/LeaderboardList';
import FriendsPanel from '../components/social/FriendsPanel';
import NoticeBanner from '../components/NoticeBanner';
import { COLORS, FONT_SIZES, SPACING, BORDER_RADIUS } from '../constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Social'>;
type Tab = 'feed' | 'leaderboard' | 'friends';

export default function SocialScreen() {
  const navigation = useNavigation<NavigationProp>();
  const dispatch = useDispatch<AppDispatch>();
  const auth = useSelector((s: RootState) => s.auth);
  const social = useSelector((s: RootState) => s.social);
  const incomingCount = useSelector(selectIncomingRequestCount);
  const [tab, setTab] = useState<Tab>('feed');
  const signedIn = auth.status === 'signedIn';

  const refresh = useCallback(() => {
    dispatch(loadFriends());
    dispatch(loadFeed());
    dispatch(loadLeaderboard());
  }, [dispatch]);

  useEffect(() => {
    if (signedIn) refresh();
  }, [signedIn, refresh]);

  // Stable callbacks: FriendsPanel's search effect depends on them.
  const onSearch = useCallback((q: string) => dispatch(searchPeople(q)), [dispatch]);
  const onClearSearch = useCallback(() => dispatch(searchCleared()), [dispatch]);
  const onClap = useCallback(
    (event: ActivityEvent) => dispatch(toggleClap({ eventId: event.id, clapped: !event.iClapped })),
    [dispatch],
  );

  const isRefreshing =
    social.feedStatus === 'loading' || social.leaderboardStatus === 'loading' || social.friendsStatus === 'loading';

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.back}
        onPress={() => navigation.goBack()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <ArrowLeft size={22} color={COLORS.textPrimary} strokeWidth={2} />
      </TouchableOpacity>
      <Text style={styles.title}>Friends</Text>
      <View style={styles.back} />
    </View>
  );

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.signedOut}>
          <View style={styles.signedOutIcon}>
            <Users size={40} color="#E86E3C" strokeWidth={1.8} />
          </View>
          <Text style={styles.signedOutTitle}>Build with friends</Text>
          <Text style={styles.signedOutText}>
            Sign in to add friends, cheer their milestones and compare bricks each week. They never
            see your habit names.
          </Text>
          <TouchableOpacity style={styles.signIn} onPress={() => navigation.navigate('SignIn')} accessibilityRole="button">
            <Text style={styles.signInText}>Sign in or create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <View style={styles.tabs}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          segments={[
            { key: 'feed', label: 'Feed' },
            { key: 'leaderboard', label: 'This week' },
            { key: 'friends', label: 'Friends', dot: incomingCount > 0 },
          ]}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} />}
      >
        {social.error && (
          <TouchableOpacity onPress={() => dispatch(socialErrorDismissed())} accessibilityHint="Dismiss">
            <NoticeBanner notice={{ kind: 'error', text: social.error }} />
          </TouchableOpacity>
        )}

        {tab === 'feed' && (
          <FeedList
            events={social.feed}
            myUserId={auth.userId}
            hasMore={social.feedHasMore}
            isLoading={social.feedStatus === 'loading'}
            onClap={onClap}
            onLoadMore={() => dispatch(loadMoreFeed())}
          />
        )}
        {tab === 'leaderboard' && (
          <LeaderboardList
            rows={social.leaderboard}
            myUserId={auth.userId}
            isLoading={social.leaderboardStatus === 'loading'}
          />
        )}
        {tab === 'friends' && (
          <FriendsPanel
            friends={social.friends}
            blocked={social.blocked}
            searchResults={social.searchResults}
            searchStatus={social.searchStatus}
            busy={social.busy}
            onSearch={onSearch}
            onClearSearch={onClearSearch}
            onAdd={(id) => dispatch(addFriend({ id }))}
            onAnswer={(id, accept) => dispatch(answerRequest({ id, accept }))}
            onRemove={(id) => dispatch(removeFriend({ id }))}
            onBlock={(id) => dispatch(block({ id }))}
            onUnblock={(id) => dispatch(unblock({ id }))}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gradientStart,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  tabs: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxxl * 2,
  },
  signedOut: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  signedOutIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(232,110,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  signedOutTitle: {
    fontSize: FONT_SIZES.xxxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  signedOutText: {
    fontSize: FONT_SIZES.lg,
    lineHeight: 23,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  signIn: {
    backgroundColor: '#E86E3C',
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xxl,
  },
  signInText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.lg,
    fontWeight: '700',
  },
});
