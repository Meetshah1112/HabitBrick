import { configureStore } from '@reduxjs/toolkit';
import habitReducer from './habitSlice';
import { storageService } from '../api/storageService';

export const store = configureStore({
  reducer: {
    habits: habitReducer,
  },
});

// ---------------------------------------------------------------------------
// Auto-persist: debounced write to AsyncStorage after every state change
// ---------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;

store.subscribe(() => {
  const state = store.getState().habits;
  if (!state.isLoaded) return; // don't persist until initial load completes

  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    
    storageService.saveHabits(state.habits);
    storageService.saveBadges(state.badges);
  }, 300);
});

// ---------------------------------------------------------------------------
// Type exports
// ---------------------------------------------------------------------------

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
