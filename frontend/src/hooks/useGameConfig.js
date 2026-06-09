import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ENTRY_FEE_COINS } from '../../../shared/gameConfig/constants.js';
import { api } from '../services/api.js';

function pickLobbyFields(slice) {
  if (!slice || typeof slice !== 'object') {
    return {
      questionCount: null,
      questionSeconds: null,
      matchmakingTimeoutMs: 12_000,
      maxRounds: null,
      enabled: true,
    };
  }

  const defaults = slice.defaults && typeof slice.defaults === 'object' ? slice.defaults : {};

  return {
    questionCount: slice.questionCount ?? defaults.questionCount ?? slice.nodesPerMatch ?? slice.sharedRounds ?? null,
    questionSeconds:
      slice.questionSeconds ??
      defaults.questionSeconds ??
      slice.turnSeconds ??
      (Number.isFinite(Number(slice.questionMs)) ? Math.round(Number(slice.questionMs) / 1000) : null),
    matchmakingTimeoutMs:
      slice.matchmakingTimeoutMs ?? defaults.matchmakingTimeoutMs ?? slice.botMatchDelayMs ?? slice.matchWindowMs ?? 12_000,
    maxRounds: slice.maxRounds ?? null,
    enabled: slice.enabled !== false,
  };
}

function entryFeeFromGamesMap(games, gameKey, variantKey = null) {
  const slice = games?.[gameKey];
  if (!slice) return DEFAULT_ENTRY_FEE_COINS;

  if (variantKey && slice.categories?.[variantKey]?.entryFee != null) {
    return Number(slice.categories[variantKey].entryFee);
  }
  if (variantKey && slice.modes?.[variantKey]?.entryFee != null) {
    return Number(slice.modes[variantKey].entryFee);
  }
  if (variantKey && slice.categories?.[variantKey]) {
    const pub = slice.categories[variantKey];
    if (Number.isFinite(Number(pub.entryFee))) return Number(pub.entryFee);
  }
  if (variantKey && slice.modes?.[variantKey]) {
    const pub = slice.modes[variantKey];
    if (Number.isFinite(Number(pub.entryFee))) return Number(pub.entryFee);
  }

  if (Number.isFinite(Number(slice.entryFee))) {
    return Number(slice.entryFee);
  }
  return DEFAULT_ENTRY_FEE_COINS;
}

/**
 * Load public game economy config for lobbies (cached in component state).
 * @param {string} [gameKey] — when set, returns slice + entryFee for one game
 * @param {{ variantKey?: string }} [options] — trivia category or enigma mode
 */
export function useGameConfig(gameKey, options = {}) {
  const variantKey = options?.variantKey ? String(options.variantKey) : null;
  const [config, setConfig] = useState(null);
  const [global, setGlobal] = useState(null);
  const [games, setGames] = useState(null);
  const [entryFee, setEntryFee] = useState(DEFAULT_ENTRY_FEE_COINS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (gameKey) {
        const [sliceData, fullData] = await Promise.all([
          api.getPublicGameConfigSlice(gameKey, variantKey),
          api.getPublicGameConfig().catch(() => null),
        ]);
        setConfig(sliceData.config ?? null);
        setEntryFee(Number(sliceData.entryFee) || DEFAULT_ENTRY_FEE_COINS);
        const fullConfig = fullData?.config ?? null;
        setGlobal(fullConfig?.global ?? null);
        setGames(fullConfig?.games ?? null);
      } else {
        const data = await api.getPublicGameConfig();
        const fullConfig = data.config ?? null;
        setConfig(fullConfig);
        setGlobal(fullConfig?.global ?? null);
        setGames(fullConfig?.games ?? null);
        setEntryFee(Number(fullConfig?.global?.defaultEntryFee) || DEFAULT_ENTRY_FEE_COINS);
      }
    } catch (e) {
      setError(e?.message || 'Failed to load game config');
      setEntryFee(DEFAULT_ENTRY_FEE_COINS);
    } finally {
      setLoading(false);
    }
  }, [gameKey, variantKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const lobbyFields = useMemo(() => pickLobbyFields(config), [config]);
  const maintenanceMode = Boolean(global?.maintenanceMode);

  const getEntryFeeForGame = useCallback(
    (key, variant = null) => {
      if (key === gameKey && (!variant || variant === variantKey)) return entryFee;
      return entryFeeFromGamesMap(games, key, variant);
    },
    [gameKey, variantKey, entryFee, games]
  );

  return {
    config,
    global,
    games,
    entryFee,
    variantKey,
    loading,
    error,
    reload,
    maintenanceMode,
    enabled: lobbyFields.enabled,
    questionCount: lobbyFields.questionCount,
    questionSeconds: lobbyFields.questionSeconds,
    matchmakingTimeoutMs: lobbyFields.matchmakingTimeoutMs,
    maxRounds: lobbyFields.maxRounds,
    getEntryFeeForGame,
  };
}

export { DEFAULT_ENTRY_FEE_COINS };
