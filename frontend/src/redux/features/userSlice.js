import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config.js';
import { DEFAULT_USER_GAMES } from '../../constants/userProfileDefaults.js';
import { getUser, toSerializableFirebase } from '../../services/userService.js';
import { callUpdateGameStats } from '../../api/cloudFunctionsApi.js';

/**
 * Build the same payload shape as {@link fetchFirestoreUserProfile} from serialized `users/{uid}` fields.
 * @param {string} uid
 * @param {Record<string, unknown>} d — document fields (no `id` required; id comes from uid)
 */

export function buildUserStatePayloadFromUserDoc(uid, d) {
  const games =
    d.games && typeof d.games === 'object'
      ? d.games
      : JSON.parse(JSON.stringify(DEFAULT_USER_GAMES));
  return {
    profile: toSerializableFirebase({ id: uid, ...d }),
    coins: d.coins ?? 0,
    xp: d.xp ?? 0,
    level: d.level ?? 1,
    earnedCoins: d.earnedCoins ?? 0,
    games,
    stats: {
      wins: d.stats?.wins ?? d.wins ?? 0,
      losses: d.stats?.losses ?? 0,
      totalMatches: d.stats?.totalMatches ?? 0,
      accuracy: d.stats?.accuracy ?? 0,
      avgMoveSpeedMs: d.stats?.avgMoveSpeedMs ?? 0,
      dailyStreak: d.dailyStreak ?? d.stats?.dailyStreak ?? 0,
      ludoMatches: d.stats?.ludoMatches ?? 0,
    },
  };
}

function mergeFirestoreProfileIntoState(state, payload) {
  const safe = toSerializableFirebase(payload);
  state.coins = safe.coins ?? state.coins;
  state.xp = safe.xp ?? state.xp;
  state.level = safe.level ?? state.level;
  state.earnedCoins = safe.earnedCoins ?? state.earnedCoins;
  state.profile = safe.profile ?? state.profile;
  state.games = safe.games ?? state.games;
  state.stats = { ...state.stats, ...safe.stats };
}

/**
 * Load extended stats from Firestore `users/{uid}` (after Firebase Auth).
 */

export const fetchFirestoreUserProfile = createAsyncThunk(
  'user/fetchFirestore',
  async (uid, { rejectWithValue }) => {
    try {
      if (!uid) return rejectWithValue('No uid');
      const ref = doc(db, 'users', uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return rejectWithValue('No Firestore profile');
      const d = toSerializableFirebase(snap.data());
      return buildUserStatePayloadFromUserDoc(uid, d);
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * OLD BACKEND (DISABLED - MIGRATED TO FIREBASE)
 * Legacy `GET /api/user/:uid` now reads Firestore directly.
 */

export const fetchUserStats = createAsyncThunk(
  'user/fetchStats',
  async (uid, { rejectWithValue }) => {
    try {
      const user = await getUser(uid);
      if (!user) return rejectWithValue('User not found');
      return {
        profile: user,
        coins: user.coins ?? 0,
        xp: user.xp ?? 0,
        stats: {
          wins: user.wins ?? user.totalWins ?? 0,
          losses: user.losses ?? 0,
          totalMatches: user.total_matches ?? user.totalMatches ?? 0,
        },
      };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Deduct coins via Cloud Function updateGameStats (server-authoritative).
 */

export const deductCoins = createAsyncThunk(
  'user/deductCoins',
  async ({ uid, amount }, { rejectWithValue }) => {
    try {
      void uid;
      const out = await callUpdateGameStats({
        coinsDelta: -Math.abs(Number(amount) || 0),
        xpDelta: 0,
      });
      return typeof out?.coins === 'number' ? out.coins : null;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Apply rewards via Cloud Function updateGameStats (server-authoritative).
 */

export const addReward = createAsyncThunk(
  'user/addReward',
  async ({ uid, coinReward, xpEarned }, { rejectWithValue }) => {
    try {
      const c = Number(coinReward) || 0;
      const x = Number(xpEarned) || 0;
      if (c !== 0 || x !== 0) {
        await callUpdateGameStats({ coinsDelta: c, xpDelta: x });
      }
      const user = await getUser(uid);
      return { coinReward, xpEarned, user };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const userSlice = createSlice({
  name: 'user',
  initialState: {
    profile: null,
    coins: 0,
    xp: 0,
    level: 1,
    earnedCoins: 0,
    games: JSON.parse(JSON.stringify(DEFAULT_USER_GAMES)),
    stats: {
      wins: 0,
      losses: 0,
      totalMatches: 0,
      accuracy: 0,
      avgMoveSpeedMs: 0,
      dailyStreak: 0,
      ludoMatches: 0,
    },
    loading: false,
    error: null,
  },
  reducers: {
    setUserStats: (state, action) => {
      const data = action.payload;
      state.profile = data.profile || state.profile;
      state.coins = data.coins ?? 0;
      state.xp = data.xp ?? 0;
      state.stats = {
        wins: data.wins ?? data.stats?.wins ?? 0,
        losses: data.losses ?? data.stats?.losses ?? 0,
        totalMatches: data.totalMatches ?? data.stats?.totalMatches ?? 0,
      };
      state.loading = false;
    },
    /** Real-time `users/{uid}` snapshot — same merge as fetchFirestoreUserProfile.fulfilled */
    syncUserFromFirestore: (state, action) => {
      mergeFirestoreProfileIntoState(state, action.payload);
    },
    clearUser: (state) => {
      state.profile = null;
      state.coins = 0;
      state.xp = 0;
      state.level = 1;
      state.earnedCoins = 0;
      state.games = JSON.parse(JSON.stringify(DEFAULT_USER_GAMES));
      state.stats = {
        wins: 0,
        losses: 0,
        totalMatches: 0,
        accuracy: 0,
        avgMoveSpeedMs: 0,
        dailyStreak: 0,
        ludoMatches: 0,
      };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserStats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchUserStats.fulfilled, (state, action) => {
        const safe = toSerializableFirebase(action.payload);
        state.loading = false;
        state.coins = safe.coins ?? 0;
        state.xp = safe.xp ?? 0;
        state.profile = safe.profile;
        state.stats = safe.stats;
      })
      .addCase(fetchUserStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchFirestoreUserProfile.fulfilled, (state, action) => {
        mergeFirestoreProfileIntoState(state, action.payload);
      })
      .addCase(fetchFirestoreUserProfile.rejected, () => {
        /* Optional: no Firestore doc yet */
      })
      .addCase(deductCoins.fulfilled, (state, action) => {
        if (typeof action.payload === 'number') {
          state.coins = action.payload;
        }
      })
      .addCase(deductCoins.rejected, (state, action) => {
        state.error = action.payload;
      })
      .addCase(addReward.fulfilled, (state, action) => {
        if (action.payload?.user) {
          state.coins = action.payload.user.coins ?? state.coins;
          state.xp = action.payload.user.xp ?? state.xp;
        }
      })
      .addCase(addReward.rejected, (state, action) => {
        state.error = action.payload;
      });
  }
});

export const { setUserStats, clearUser, syncUserFromFirestore } = userSlice.actions;
export default userSlice.reducer;
