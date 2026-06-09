import { useCallback, useState } from 'react';
import matchHelpers from '../firebase/matchmaking';

export default function useMatchmaking(currentPlayer) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const smartMatch = useCallback(
    async (candidates = [], options = {}) => {
      setCreating(true);
      setError(null);

      try {
        const best = matchHelpers.findBestMatch(currentPlayer, candidates, options);

        if (best) {
          const match = await matchHelpers.createMatch(
            currentPlayer,
            best,
            { persist: true, mode: options.mode }
          );
          setCreating(false);
          return match;
        }

        const bot = matchHelpers.createBotForLevel(currentPlayer.profile?.level || 1);
        const match = await matchHelpers.createMatch(
          currentPlayer,
          bot,
          { persist: true, mode: options.mode }
        );

        setCreating(false);
        return match;

      } catch (e) {
        console.error('Smart match failed:', e);
        setError(e);
        setCreating(false);
        return null;
      }
    },
    [currentPlayer]
  );

  const invitePlayer = useCallback(
    async (targetPlayer, options = {}) => {
      setCreating(true);
      setError(null);

      try {
        const match = await matchHelpers.createMatch(
          currentPlayer,
          targetPlayer,
          { persist: true, mode: options.mode }
        );

        setCreating(false);
        return match;

      } catch (e) {
        console.error('Invite match failed:', e);
        setError(e);
        setCreating(false);
        return null;
      }
    },
    [currentPlayer]
  );

  return {
    smartMatch,
    invitePlayer,
    creating,
    error,
  };
}
