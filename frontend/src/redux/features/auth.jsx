import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    /** Mirrors Firebase `auth.currentUser.uid` — source of truth for isAuthenticated. */
    firebaseUid: null,
    loading: false,
    /** True until Firebase `onAuthStateChanged` has fired once (session restore). */
    firebaseReady: false,
    error: null,
    isAuthenticated: false,
    /** Global auth notice (OAuth errors, profile sync, linking). */
    authNotice: null,
    profileSyncPending: false,
    profileSyncError: null,
  },
  reducers: {
    /** Apply identity from Firebase Auth (immediate — does not wait for Firestore). */
    setFirebaseIdentity: (state, action) => {
      const payload = action.payload;
      state.user = payload;
      state.firebaseUid = payload?.uid ?? null;
      state.isAuthenticated = !!payload?.uid;
      state.error = null;
    },
    setUser: (state, action) => {
      state.user = action.payload;
      state.firebaseUid = action.payload?.uid ?? null;
      state.isAuthenticated = !!action.payload?.uid;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
    },
    setAuthNotice: (state, action) => {
      state.authNotice = action.payload ? String(action.payload) : null;
    },
    clearAuthNotice: (state) => {
      state.authNotice = null;
    },
    setProfileSyncState: (state, action) => {
      const { pending, error } = action.payload || {};
      if (typeof pending === 'boolean') state.profileSyncPending = pending;
      state.profileSyncError = error ?? null;
    },
    logout: (state) => {
      state.user = null;
      state.firebaseUid = null;
      state.isAuthenticated = false;
      state.error = null;
      state.profileSyncPending = false;
      state.profileSyncError = null;
    },
    setFirebaseReady: (state, action) => {
      state.firebaseReady = !!action.payload;
    },
  },
});

export const {
  setUser,
  setFirebaseIdentity,
  setLoading,
  setError,
  logout,
  setFirebaseReady,
  setAuthNotice,
  clearAuthNotice,
  setProfileSyncState,
} = authSlice.actions;
export default authSlice.reducer;
