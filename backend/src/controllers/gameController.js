import * as dataService from '../services/dataService.js';
import * as userFirestoreAdmin from '../services/userFirestoreAdmin.js';
import { listRecentEnigmaResultsForUser } from '../services/enigmaPulse/firestoreRepos.js';

export const matchmake = async (req, res) => {
    const userId = req.userId;
    const { difficulty, category, gameType } = req.body || {};
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    try {
        // Simple logic: check for waiting rooms, or create a new one
        const rooms = await dataService.getRooms();
        const waitingRoom = rooms.find(r => 
            r.status === 'waiting' && 
            r.difficulty === difficulty && 
            r.category === category &&
            r.gameType === gameType &&
            r.player1_id !== userId
        );

        if (waitingRoom) {
            waitingRoom.player2_id = userId;
            waitingRoom.status = 'active';
            await dataService.saveRooms(rooms);
            return res.json({ roomId: waitingRoom.id, mode: 'joined' });
        }

        // Create new room
        const newRoom = await dataService.createRoom({
            owner_id: userId,
            player1_id: userId,
            difficulty,
            category,
            gameType: gameType || 'trivia',
            max_players: 2
        });
        
        res.json({ roomId: newRoom.id, mode: 'waiting' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const matchmakeBot = async (req, res) => {
    const userId = req.userId;
    const { roomId } = req.body || {};
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        const rooms = await dataService.getRooms();
        const room = rooms.find(r => r.id === roomId);
        if (room) {
            if (room.player1_id !== userId && room.owner_id !== userId) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            room.player2_id = 'bot_' + Math.random().toString(36).substr(2, 5);
            room.status = 'active';
            await dataService.saveRooms(rooms);
            res.json({ success: true, roomId });
        } else {
            res.status(404).json({ success: false, message: 'Room not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRoom = async (req, res) => {
    try {
        const uid = req.userId;
        if (!uid) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const room = await dataService.getRoomById(req.params.id);
        if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
        const isMember = room.player1_id === uid || room.player2_id === uid || room.owner_id === uid;
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        res.json(room);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const submitAnswer = async (req, res) => {
    const userId = req.userId;
    const { roomId, timeTaken, selectedAnswer } = req.body || {};
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roomId) {
        return res.status(400).json({ success: false, message: 'roomId is required' });
    }
    if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer > 3) {
        return res.status(400).json({ success: false, message: 'Invalid selectedAnswer' });
    }
    const parsedTimeTaken = Number(timeTaken);
    if (!Number.isFinite(parsedTimeTaken) || parsedTimeTaken < 0 || parsedTimeTaken > 120000) {
        return res.status(400).json({ success: false, message: 'Invalid timeTaken' });
    }
    const room = await dataService.getRoomById(roomId);
    if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
    }
    const isMember = room.player1_id === userId || room.player2_id === userId || room.owner_id === userId;
    if (!isMember) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const correctIndex = Number(room.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        return res.status(400).json({ success: false, message: 'Server has no authoritative answer for this room' });
    }
    const isCorrect = selectedAnswer === correctIndex;
    
    let xpGiained = 0;
    let coinsGained = 0;
    
    try {
        if (isCorrect) {
            xpGiained = 20;
            coinsGained = 5;
            await dataService.addUserCoins(userId, coinsGained);
            
            const user = await dataService.getUserById(userId);
            if (user) {
                await dataService.updateUserStats(userId, {
                    xp: (user.xp || 0) + xpGiained,
                    total_questions_answered: (user.total_questions_answered || 0) + 1,
                    total_time_taken: (user.total_time_taken || 0) + parsedTimeTaken
                });
            }
        }
        
        res.json({ success: true, correct: isCorrect, xp: xpGiained, coins: coinsGained });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const endMatch = async (req, res) => {
    const userId = req.userId;
    const { roomId, result } = req.body || {}; // result: 'win', 'loss', 'draw'
    if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roomId) {
        return res.status(400).json({ success: false, message: 'roomId is required' });
    }
    if (!['win', 'loss', 'draw'].includes(String(result))) {
        return res.status(400).json({ success: false, message: 'Invalid result' });
    }
    try {
        const room = await dataService.getRoomById(roomId);
        if (!room) {
            return res.status(404).json({ success: false, message: 'Room not found' });
        }
        const isMember = room.player1_id === userId || room.player2_id === userId || room.owner_id === userId;
        if (!isMember) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const user = await dataService.getUserById(userId);
        if (user) {
            const updates = {
                total_matches: (user.total_matches || 0) + 1
            };
            if (result === 'win') {
                updates.wins = (user.wins || 0) + 1;
            }
            await dataService.updateUserStats(userId, updates);
        }
        
        await dataService.updateRoomStatus(roomId, 'finished');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};










// import * as dataService from '../services/dataService.js';
// import { v4 as uuidv4 } from 'uuid';
// export const matchmake = async (req, res) => {
//     const { userId, difficulty, category } = req.body;
//     // For JSON DB, we'll just simulate a room creation/join
//     const roomId = uuidv4();
//     res.json({ roomId, mode: 'waiting' });
//     const { userId, difficulty, category, gameType } = req.body;
    
//     try {
//         // Simple logic: check for waiting rooms, or create a new one
//         const rooms = await dataService.getRooms();
//         const waitingRoom = rooms.find(r => 
//             r.status === 'waiting' && 
//             r.difficulty === difficulty && 
//             r.category === category &&
//             r.gameType === gameType &&
//             r.player1_id !== userId
//         );
//         if (waitingRoom) {
//             waitingRoom.player2_id = userId;
//             waitingRoom.status = 'active';
//             await dataService.saveRooms(rooms);
//             return res.json({ roomId: waitingRoom.id, mode: 'joined' });
//         }
//         // Create new room
//         const newRoom = await dataService.createRoom({
//             owner_id: userId,
//             player1_id: userId,
//             difficulty,
//             category,
//             gameType: gameType || 'trivia',
//             max_players: 2
//         });
        
//         res.json({ roomId: newRoom.id, mode: 'waiting' });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };
// export const matchmakeBot = async (req, res) => {
//     const { roomId } = req.body;
//     res.json({ success: true, roomId });
//     try {
//         const rooms = await dataService.getRooms();
//         const room = rooms.find(r => r.id === roomId);
//         if (room) {
//             room.player2_id = 'bot_' + Math.random().toString(36).substr(2, 5);
//             room.status = 'active';
//             await dataService.saveRooms(rooms);
//             res.json({ success: true, roomId });
//         } else {
//             res.status(404).json({ success: false, message: 'Room not found' });
//         }
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };
// export const getRoom = async (req, res) => {
//     res.json({ id: req.params.id, status: 'waiting' });
//     try {
//         const room = await dataService.getRoomById(req.params.id);
//         if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
//         res.json(room);
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };
// export const submitAnswer = async (req, res) => {
//     const { userId, timeTaken, correctIndex, selectedAnswer } = req.body;
//     const isCorrect = selectedAnswer === correctIndex;
    
//     let xp = 0;
//     let coins = 0;
//     let xpGiained = 0;
//     let coinsGained = 0;
    
//     if (isCorrect) {
//         xp = 20;
//         coins = 5;
//         await dataService.addUserCoins(userId, coins);
//         // xp update would go here
//     try {
//         if (isCorrect) {
//             xpGiained = 20;
//             coinsGained = 5;
//             await dataService.addUserCoins(userId, coinsGained);
            
//             const user = await dataService.getUserById(userId);
//             if (user) {
//                 await dataService.updateUserStats(userId, {
//                     xp: (user.xp || 0) + xpGiained,
//                     total_questions_answered: (user.total_questions_answered || 0) + 1,
//                     total_time_taken: (user.total_time_taken || 0) + (timeTaken || 0)
//                 });
//             }
//         }
        
//         res.json({ success: true, correct: isCorrect, xp: xpGiained, coins: coinsGained });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
    
//     res.json({ success: true, correct: isCorrect, xp, coins });
// };
// export const endMatch = async (req, res) => {
//     res.json({ success: true });
//     const { userId, roomId, result } = req.body; // result: 'win', 'loss', 'draw'
//     try {
//         const user = await dataService.getUserById(userId);
//         if (user) {
//             const updates = {
//                 total_matches: (user.total_matches || 0) + 1
//             };
//             if (result === 'win') {
//                 updates.wins = (user.wins || 0) + 1;
//             }
//             await dataService.updateUserStats(userId, updates);
//         }
        
//         await dataService.updateRoomStatus(roomId, 'finished');
//         res.json({ success: true });
//     } catch (error) {
//         res.status(500).json({ success: false, message: error.message });
//     }
// };

/**
 * Firebase-only players: no row in legacy users.json. Apply coins + Firestore stats here.
 * @param {string} tokenUserId
 * @param {{ gameType: string, result: string, score: number }} payload
 */
async function applyPostGameRewardFirestoreOnly(tokenUserId, { gameType, result, score }) {
  const econ = dataService.getMatchRewardEconomy(String(result), String(gameType), score);
  await userFirestoreAdmin.ensureUserDocAdmin(tokenUserId);
  await userFirestoreAdmin.updatePlayerStatsCanonical({
    uid: tokenUserId,
    coinsDelta: econ.coinsDelta,
    xpDelta: 0,
    touchStreak: true,
  });

  const gameKey = String(gameType) === 'math_rush' ? 'mathRush' : 'trivia';
  const r = String(result);
  const won = r === 'win';
  const lost = r === 'lose';
  const reward = econ.reward;

  await userFirestoreAdmin.recordGameOutcome({
    uid: tokenUserId,
    gameKey,
    won,
    matches: 1,
    wins: won ? 1 : 0,
    xp: reward?.xpEarned ?? 0,
    bestScore: gameKey === 'mathRush' ? Number(score) || 0 : undefined,
    globalStats: {
      totalMatches: 1,
      wins: won ? 1 : 0,
      losses: lost ? 1 : 0,
    },
  });

  const doc = await userFirestoreAdmin.getUserDocumentPublic(tokenUserId);
  return {
    ...doc,
    _reward: reward,
  };
}

/**
 * POST /api/game/reward — JWT only; optional body.userId must match token.
 */
export const postGameReward = async (req, res) => {
    const { userId: bodyUserId, gameType, result, score } = req.body || {};
    const tokenUserId = req.userId;
    if (!tokenUserId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (bodyUserId && bodyUserId !== tokenUserId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!gameType || !['trivia', 'math_rush'].includes(String(gameType))) {
        return res.status(400).json({ success: false, message: 'Invalid gameType' });
    }
    if (!result || !['win', 'lose', 'draw'].includes(String(result))) {
        return res.status(400).json({ success: false, message: 'Invalid result' });
    }
    try {
        let user;
        let usedFirestoreRewardPath = false;
        try {
            user = await dataService.recordGameReward(tokenUserId, {
                gameType: String(gameType),
                result: String(result),
                score,
            });
        } catch (fileErr) {
            if (fileErr?.message !== 'User not found') throw fileErr;
            user = await applyPostGameRewardFirestoreOnly(tokenUserId, {
                gameType: String(gameType),
                result: String(result),
                score,
            });
            usedFirestoreRewardPath = true;
        }
        const reward = user._reward;
        const { _reward, password: _p, ...safeUser } = user;

        const gameKey = String(gameType) === 'math_rush' ? 'mathRush' : 'trivia';
        const r = String(result);
        const won = r === 'win';
        const lost = r === 'lose';
        if (!usedFirestoreRewardPath) {
            try {
                await userFirestoreAdmin.recordGameOutcome({
                    uid: tokenUserId,
                    gameKey,
                    won,
                    matches: 1,
                    wins: won ? 1 : 0,
                    xp: reward?.xpEarned ?? 0,
                    bestScore: gameKey === 'mathRush' ? Number(score) || 0 : undefined,
                    globalStats: {
                        totalMatches: 1,
                        wins: won ? 1 : 0,
                        losses: lost ? 1 : 0,
                    },
                });
            } catch (fsErr) {
                if (fsErr?.message !== 'FIRESTORE_ADMIN_UNAVAILABLE' && fsErr?.code !== 'FIRESTORE_ADMIN_UNAVAILABLE') {
                    console.warn('[postGameReward] Firestore mirror:', fsErr.message);
                }
            }
        }

        res.json({ success: true, user: safeUser, reward });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message || 'Reward failed' });
    }
};

export const deductCoins = async (req, res) => {
    const { userId: bodyUserId, amount } = req.body;
    const targetUserId = bodyUserId ?? req.userId;
    if (!targetUserId) {
        return res.status(400).json({ success: false, message: 'userId required' });
    }
    if (targetUserId !== req.userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
        const newBalance = await dataService.deductUserCoins(targetUserId, amount);
        res.json({ success: true, newBalance });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const updateStats = async (req, res) => {
    const { id } = req.params;
    const stats = req.body;
    if (!id) {
        return res.status(400).json({ success: false, message: 'User id required' });
    }
    if (id !== req.userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    try {
        const updatedUser = await dataService.updateUserStats(id, stats);
        res.json({ success: true, user: updatedUser });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getRecentEnigmaResults = async (req, res) => {
    const uid = req.userId;
    if (!uid) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    try {
        const gameKey = String(req.query?.gameKey || 'syllogism');
        const limit = Number(req.query?.limit || 10);
        const results = await listRecentEnigmaResultsForUser({ uid, gameKey, limit });
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message || 'Could not load results' });
    }
};

