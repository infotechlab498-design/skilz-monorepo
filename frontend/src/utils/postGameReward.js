import { authHeadersAsync } from './authToken.js';
import { getJwtUserId } from './gameAuthSync.js';

/**
 * Claim post-match coins/XP via POST /api/game/reward (JWT required).
 */
export async function postGameReward({ gameType, result, score }) {
    const userId = getJwtUserId();
    if (!userId) {
        return { ok: false, error: 'Not authenticated' };
    }
    const res = await fetch('/api/game/reward', {
        method: 'POST',
        headers: await authHeadersAsync(),
        body: JSON.stringify({
            userId,
            gameType,
            result,
            score: Number(score) || 0,
        }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        return { ok: false, error: data.message || 'Reward failed' };
    }
    return {
        ok: true,
        user: data.user,
        reward: data.reward,
    };
}
