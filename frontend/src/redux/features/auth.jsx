import { createSlice } from '@reduxjs/toolkit';

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    loading: false,
    /** True until Firebase `onAuthStateChanged` has fired once (session restore). */
    firebaseReady: false,
    error: null,
    isAuthenticated: false,
  },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
      state.isAuthenticated = !!action.payload;
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
      state.isAuthenticated = false;
      state.error = null;
    },
    setFirebaseReady: (state, action) => {
      state.firebaseReady = !!action.payload;
    },
  },
});

export const { setUser, setLoading, setError, logout, setFirebaseReady } = authSlice.actions;
export default authSlice.reducer;









