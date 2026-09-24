/**
 * Social UI state: friends and requests, the milestone feed, the weekly
 * leaderboard and people search. Nothing here is persisted — it is always
 * re-fetched — and it is cleared whenever the signed-in account changes, so
 * one person's friends can never show up under another's account.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import {
  blockUser,
  fetchFeed,
  fetchLeaderboard,
  listBlocked,
  listFriendships,
  removeFriendship,
  respondToFriendRequest,
  searchProfiles,
  sendFriendRequest,
  setClap,
  unblockUser,
  type BlockedUser,
} from '../api/socialService';
import type { ActivityEvent, Friend, LeaderboardRow, ProfileSummary, Result } from '../types/social';
import { getWeekStartStr } from '../utils/streaks';
import { authUserChanged, signOutUser } from './authSlice';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface SocialState {
  friends: Friend[];
  blocked: BlockedUser[];
  friendsStatus: LoadStatus;
  feed: ActivityEvent[];
  feedStatus: LoadStatus;
  feedHasMore: boolean;
  leaderboard: LeaderboardRow[];
  leaderboardStatus: LoadStatus;
  searchQuery: string;
  searchResults: ProfileSummary[];
  searchStatus: LoadStatus;
  /** Ids (user, friendship or event) with an action in flight, to disable their buttons. */
  busy: string[];
  /** The last action error, shown inline. */
  error: string | null;
  forUserId: string | null;
}

const initialState: SocialState = {
  friends: [],
  blocked: [],
  friendsStatus: 'idle',
  feed: [],
  feedStatus: 'idle',
  feedHasMore: false,
  leaderboard: [],
  leaderboardStatus: 'idle',
  searchQuery: '',
  searchResults: [],
  searchStatus: 'idle',
  busy: [],
  error: null,
  forUserId: null,
};

const FEED_PAGE_SIZE = 30;

type Rejected = { rejectValue: string };

// ---------------------------------------------------------------------------
// Loads
// ---------------------------------------------------------------------------

export const loadFriends = createAsyncThunk<{ friends: Friend[]; blocked: BlockedUser[] }, void, Rejected>(
  'social/loadFriends',
  async (_, { rejectWithValue }) => {
    const [friends, blocked] = await Promise.all([listFriendships(), listBlocked()]);
    if (!friends.ok) return rejectWithValue(friends.error);
    if (!blocked.ok) return rejectWithValue(blocked.error);
    return { friends: friends.data, blocked: blocked.data };
  },
);

export const loadFeed = createAsyncThunk<ActivityEvent[], void, Rejected>(
  'social/loadFeed',
  async (_, { rejectWithValue }) => {
    const result = await fetchFeed();
    return result.ok ? result.data : rejectWithValue(result.error);
  },
);

export const loadMoreFeed = createAsyncThunk<ActivityEvent[], void, Rejected & { state: { social: SocialState } }>(
  'social/loadMoreFeed',
  async (_, { getState, rejectWithValue }) => {
    const { feed } = getState().social;
    const result = await fetchFeed(feed[feed.length - 1]?.createdAt);
    return result.ok ? result.data : rejectWithValue(result.error);
  },
);

export const loadLeaderboard = createAsyncThunk<LeaderboardRow[], void, Rejected>(
  'social/loadLeaderboard',
  async (_, { rejectWithValue }) => {
    const result = await fetchLeaderboard(getWeekStartStr());
    return result.ok ? result.data : rejectWithValue(result.error);
  },
);

export const searchPeople = createAsyncThunk<{ query: string; results: ProfileSummary[] }, string, Rejected>(
  'social/search',
  async (query, { rejectWithValue }) => {
    const result = await searchProfiles(query);
    if (!result.ok) return rejectWithValue(result.error);
    return { query, results: result.data };
  },
);

// ---------------------------------------------------------------------------
// Actions on a person or a request. Each reloads the friend list afterwards,
// so the screen always reflects what the server decided.
// ---------------------------------------------------------------------------

function friendAction<Arg extends { id: string }>(type: string, run: (arg: Arg) => Promise<Result<null>>) {
  return createAsyncThunk<void, Arg, Rejected>(type, async (arg, { dispatch, rejectWithValue }) => {
    const result = await run(arg);
    if (!result.ok) return rejectWithValue(result.error);
    await dispatch(loadFriends());
  });
}

export const addFriend = friendAction<{ id: string }>('social/add', ({ id }) => sendFriendRequest(id));
export const answerRequest = friendAction<{ id: string; accept: boolean }>(
  'social/answer',
  ({ id, accept }) => respondToFriendRequest(id, accept),
);
export const removeFriend = friendAction<{ id: string }>('social/remove', ({ id }) => removeFriendship(id));
export const block = friendAction<{ id: string }>('social/block', ({ id }) => blockUser(id));
export const unblock = friendAction<{ id: string }>('social/unblock', ({ id }) => unblockUser(id));

/** Optimistic: the clap shows instantly and is rolled back if the server refuses. */
export const toggleClap = createAsyncThunk<void, { eventId: string; clapped: boolean }, Rejected>(
  'social/clap',
  async ({ eventId, clapped }, { rejectWithValue }) => {
    const result = await setClap(eventId, clapped);
    if (!result.ok) return rejectWithValue(result.error);
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const FRIEND_ACTIONS = [addFriend, answerRequest, removeFriend, block, unblock];

function applyClap(state: SocialState, eventId: string, clapped: boolean): void {
  const event = state.feed.find((e) => e.id === eventId);
  if (!event || event.iClapped === clapped) return;
  event.iClapped = clapped;
  event.clapCount = Math.max(0, event.clapCount + (clapped ? 1 : -1));
}

const socialSlice = createSlice({
  name: 'social',
  initialState,
  reducers: {
    socialErrorDismissed(state) {
      state.error = null;
    },
    searchCleared(state) {
      state.searchQuery = '';
      state.searchResults = [];
      state.searchStatus = 'idle';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadFriends.pending, (state) => {
        if (state.friendsStatus !== 'ready') state.friendsStatus = 'loading';
      })
      .addCase(loadFriends.fulfilled, (state, action) => {
        state.friends = action.payload.friends;
        state.blocked = action.payload.blocked;
        state.friendsStatus = 'ready';
      })
      .addCase(loadFriends.rejected, (state, action) => {
        state.friendsStatus = 'error';
        state.error = action.payload ?? 'Could not load your friends.';
      })

      .addCase(loadFeed.pending, (state) => {
        if (state.feedStatus !== 'ready') state.feedStatus = 'loading';
      })
      .addCase(loadFeed.fulfilled, (state, action) => {
        state.feed = action.payload;
        state.feedHasMore = action.payload.length === FEED_PAGE_SIZE;
        state.feedStatus = 'ready';
      })
      .addCase(loadFeed.rejected, (state, action) => {
        state.feedStatus = 'error';
        state.error = action.payload ?? 'Could not load the feed.';
      })
      .addCase(loadMoreFeed.fulfilled, (state, action) => {
        const known = new Set(state.feed.map((e) => e.id));
        state.feed.push(...action.payload.filter((e) => !known.has(e.id)));
        state.feedHasMore = action.payload.length === FEED_PAGE_SIZE;
      })

      .addCase(loadLeaderboard.pending, (state) => {
        if (state.leaderboardStatus !== 'ready') state.leaderboardStatus = 'loading';
      })
      .addCase(loadLeaderboard.fulfilled, (state, action) => {
        state.leaderboard = action.payload;
        state.leaderboardStatus = 'ready';
      })
      .addCase(loadLeaderboard.rejected, (state, action) => {
        state.leaderboardStatus = 'error';
        state.error = action.payload ?? 'Could not load the leaderboard.';
      })

      .addCase(searchPeople.pending, (state, action) => {
        state.searchQuery = action.meta.arg;
        state.searchStatus = 'loading';
      })
      .addCase(searchPeople.fulfilled, (state, action) => {
        // Drop a slow response for a query the user has already changed.
        if (action.payload.query !== state.searchQuery) return;
        state.searchResults = action.payload.results;
        state.searchStatus = 'ready';
      })
      .addCase(searchPeople.rejected, (state, action) => {
        if (action.meta.arg !== state.searchQuery) return;
        state.searchStatus = 'error';
        state.error = action.payload ?? 'Search failed.';
      })

      .addCase(toggleClap.pending, (state, action) => {
        applyClap(state, action.meta.arg.eventId, action.meta.arg.clapped);
      })
      .addCase(toggleClap.rejected, (state, action) => {
        applyClap(state, action.meta.arg.eventId, !action.meta.arg.clapped);
        state.error = action.payload ?? 'Could not save your clap.';
      })

      .addCase(authUserChanged, (state, action) => {
        if (action.payload !== state.forUserId) return { ...initialState, forUserId: action.payload };
        return state;
      })
      .addCase(signOutUser.fulfilled, () => initialState);

    for (const thunk of FRIEND_ACTIONS) {
      builder
        .addCase(thunk.pending, (state, action) => {
          state.busy.push(action.meta.arg.id);
          state.error = null;
        })
        .addCase(thunk.fulfilled, (state, action) => {
          state.busy = state.busy.filter((id) => id !== action.meta.arg.id);
        })
        .addCase(thunk.rejected, (state, action) => {
          state.busy = state.busy.filter((id) => id !== action.meta.arg.id);
          state.error = action.payload ?? 'Something went wrong.';
        });
    }
  },
});

export const { socialErrorDismissed, searchCleared } = socialSlice.actions;

export const selectIncomingRequestCount = (state: { social: SocialState }): number =>
  state.social.friends.filter((f) => f.status === 'pending' && f.isIncoming).length;

export default socialSlice.reducer;
