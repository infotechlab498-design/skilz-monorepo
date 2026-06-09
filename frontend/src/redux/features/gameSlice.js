import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    currentGame: null,
    players: [],
    timer: null,
    result: null,
    lastError: null,
    loading: false,
    lastReward: null,
};

const gameSlice = createSlice({
    name: 'game',
    initialState,
    reducers: {
        setGameSession(state, action) {
            const { gameType, roomId, match } = action.payload || {};
            state.currentGame = { gameType, roomId, match };
            state.lastError = null;
            if (match?.players?.length) {
                state.players = match.players;
            } else if (match?.player1) {
                state.players = [match.player1, match.player2].filter(Boolean);
            }
        },
        setGameTimer(state, action) {
            state.timer = action.payload;
        },
        setGameResult(state, action) {
            state.result = action.payload;
            state.loading = false;
        },
        setGameLoading(state, action) {
            state.loading = !!action.payload;
        },
        setGameError(state, action) {
            const p = action.payload;
            state.lastError =
                typeof p === 'string' ? p : p?.message || p?.error || 'Error';
        },
        clearGameSession() {
            return { ...initialState };
        },
        setLastReward(state, action) {
            state.lastReward = action.payload;
        },
    },
});

export const {
    setGameSession,
    setGameTimer,
    setGameResult,
    setGameLoading,
    setGameError,
    clearGameSession,
    setLastReward,
} = gameSlice.actions;

export default gameSlice.reducer;
