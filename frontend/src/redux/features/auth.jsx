import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    /** Firebase uid — source of truth for `isAuthenticated` (mirrors auth.currentUser). */
    firebaseUid: null,
    loading: false,
    /** True until Firebase `onAuthStateChanged` has fired once (session restore). */
    firebaseReady: false,
    error: null,
    isAuthenticated: false,
    /** Global auth notice (OAuth errors, profile sync warnings). */
    authNotice: null,
    profileSyncPending: false,
    profileSyncError: null,
  },
  reducers: {
    /** Legacy/dev JWT path — sets full user + authenticated. */
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
      if (action.payload?.uid) {
        state.firebaseUid = action.payload.uid;
      }
    },
    /**
     * Firebase session mirror — authentication is true when Firebase has a uid,
     * independent of Firestore profile sync success.
     */
    setFirebaseSession: (state, action) => {
      const p = action.payload;
      const uid = p?.uid || null;
      state.firebaseUid = uid;
      state.isAuthenticated = !!uid;
      state.user = uid ? { ...(state.user || {}), ...p } : null;
      state.profileSyncPending = false;
      state.profileSyncError = null;
    },
    setProfileSyncPending: (state, action) => {
      state.profileSyncPending = !!action.payload;
    },
    setProfileSyncError: (state, action) => {
      state.profileSyncError = action.payload || null;
    },
    setAuthNotice: (state, action) => {
      state.authNotice =
        typeof action.payload === 'string' && action.payload.trim()
          ? action.payload.trim()
          : null;
    },
    clearAuthNotice: (state) => {
      state.authNotice = null;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
      state.loading = false;
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
  setFirebaseSession,
  setProfileSyncPending,
  setProfileSyncError,
  setAuthNotice,
  clearAuthNotice,
  setLoading,
  setError,
  logout,
  setFirebaseReady,
} = authSlice.actions;
export default authSlice.reducer;
