import React, { createContext, useContext, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
    setGameSession,
    setGameTimer,
    setGameResult,
    setGameLoading,
    setGameError,
    clearGameSession,
    setLastReward,
} from '../redux/features/gameSlice.js';

const GameSessionContext = createContext(null);

/**
 * Active realtime match session (Trivia / Math Rush). Auth user stays in {@link UserContext}.
 */
export function GameSessionProvider({ children }) {
    const dispatch = useDispatch();
    const game = useSelector((s) => s.game);

    const setSession = useCallback((payload) => dispatch(setGameSession(payload)), [dispatch]);
    const setTimer = useCallback((v) => dispatch(setGameTimer(v)), [dispatch]);
    const setResult = useCallback((v) => dispatch(setGameResult(v)), [dispatch]);
    const setLoading = useCallback((v) => dispatch(setGameLoading(v)), [dispatch]);
    const setError = useCallback((v) => dispatch(setGameError(v)), [dispatch]);
    const clearSession = useCallback(() => dispatch(clearGameSession()), [dispatch]);
    const setReward = useCallback((v) => dispatch(setLastReward(v)), [dispatch]);

    const value = useMemo(() => {
        return {
            currentGame: game.currentGame,
            players: game.players,
            timer: game.timer,
            result: game.result,
            lastError: game.lastError,
            loading: game.loading,
            lastReward: game.lastReward,
            setSession,
            setTimer,
            setResult,
            setLoading,
            setError,
            clearSession,
            setReward,
        };
    }, [
        game,
        setSession,
        setTimer,
        setResult,
        setLoading,
        setError,
        clearSession,
        setReward,
    ]);

    return <GameSessionContext.Provider value={value}>{children}</GameSessionContext.Provider>;
}

export function useGameSession() {
    const ctx = useContext(GameSessionContext);
    if (!ctx) {
        throw new Error('useGameSession must be used within GameSessionProvider');
    }
    return ctx;
}
