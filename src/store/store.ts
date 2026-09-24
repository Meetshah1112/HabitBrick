import { configureStore } from '@reduxjs/toolkit';
import habitReducer from './habitSlice';
import authReducer from './authSlice';
import syncReducer from './syncSlice';
import { syncListener } from './syncListener';
import { storageService } from '../api/storageService';

export const store = configureStore({
  reducer: {
    habits: habitReducer,
    auth: authReducer,
    sync: syncReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(syncListener.middleware),
});

// ---------------------------------------------------------------------------
// Auto-persist: debounced write to AsyncStorage after every state change.
//
// Habits, badges and the sync outbox are written in ONE multiSet, so a change
// and the outbox entry that will sync it land together: if the app is killed
// right after a tap, the change is still queued on the next launch.
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

store.subscribe(() => {
  if (!store.getState().habits.isLoaded) return; // don't persist until initial load completes

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { habits, sync } = store.getState();
    storageService
      .persistSnapshot({
        habits: habits.habits,
        badges: habits.badges,
        // Until the stored outbox has been read, never overwrite it with the
        // empty pre-load one.
        syncState: sync.loaded ? { outbox: sync.outbox, cursor: sync.cursor } : null,
      })
      .catch((error: unknown) => {
        if (__DEV__) console.warn('[store] persist failed', error);
      });
  }, 300);
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
