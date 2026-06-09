import * as dataService from '../services/dataService.js';
import { safeReadWrite, readJsonFile } from '../utils/fileHandler.js';

/**
 * Math Rush / leaderboard score update — uses canonical `data/users.json` and `data/scores.json`.
 * Body field `uid` is treated as user identifier (matches `user.id` or optional `user.uid`).
 */
export const updateScore = async (req, res) => {
  try {
    const { uid, score, streak, coinsGained, isWinner, successCount, failureCount } = req.body;
    if (!uid || score === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await dataService.getUserByIdOrUid(uid);
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }
    const canonicalId = existing.id;

    if (req.userId && req.userId !== canonicalId) {
      return res.status(403).json({ error: 'Cannot update another user\'s score' });
    }

    let resultPayload;
    await safeReadWrite(dataService.USERS_FILE, async (users) => {
      const userIndex = users.findIndex(
        (u) => u.id === canonicalId || u.uid === uid
      );
      if (userIndex === -1) {
        throw new Error('User not found');
      }

      const user = { ...users[userIndex] };
      user.xp = user.xp || 0;
      user.coins = user.coins || 0;
      user.streak = user.streak || 0;

      const streakVal = streak ?? 0;
      const xpGained =
        Math.floor(score * 0.1) +
        (successCount || 0) * 5 +
        streakVal * 5;
      user.xp += xpGained;
      user.level = Math.floor(Math.sqrt(user.xp / 100)) + 1;

      let finalCoinsGained = coinsGained;
      if (finalCoinsGained === undefined) {
        finalCoinsGained =
          Math.floor(score * 0.5) +
          (successCount || 0) * 2 -
          (failureCount || 0) * 1;
        finalCoinsGained = Math.max(5, finalCoinsGained);
      }

      user.coins += finalCoinsGained;

      if (isWinner) {
        user.streak += 1;
        user.totalWins = (user.totalWins || 0) + 1;
      } else if (isWinner === false) {
        user.streak = 0;
      }

      user.totalMatches = (user.totalMatches || 0) + 1;

      if (score > (user.highScore || 0)) {
        user.highScore = score;
      }

      user.lastUpdated = new Date().toISOString();

      users[userIndex] = user;
      resultPayload = {
        user,
        xpGained,
        coinsGained: finalCoinsGained,
        newLevel: user.level,
      };
      return users;
    });

    await safeReadWrite(dataService.SCORES_FILE, async (scores) => {
      const scoreIndex = scores.findIndex(
        (s) => s.id === canonicalId || s.uid === uid
      );

      const leaderboardEntry = {
        id: canonicalId,
        uid: resultPayload.user.uid || canonicalId,
        displayName: resultPayload.user.displayName || resultPayload.user.name,
        photoURL: resultPayload.user.photoURL,
        score: resultPayload.user.highScore,
        level: resultPayload.user.level,
        timestamp: new Date().toISOString(),
      };

      if (scoreIndex !== -1) {
        if (leaderboardEntry.score > scores[scoreIndex].score) {
          scores[scoreIndex] = leaderboardEntry;
        }
      } else {
        scores.push(leaderboardEntry);
      }
      return scores;
    });

    const { password: _p, ...safeUser } = resultPayload.user;
    res.json({
      user: safeUser,
      xpGained: resultPayload.xpGained,
      coinsGained: resultPayload.coinsGained,
      newLevel: resultPayload.newLevel,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getLeaderboard = async (req, res) => {
  try {
    const scores = await readJsonFile(dataService.SCORES_FILE);
    const topPlayers = scores
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.json(topPlayers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
