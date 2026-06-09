import * as dataService from '../services/dataService.js';
import * as userFirestoreAdmin from '../services/userFirestoreAdmin.js';
import { safeReadWrite, readJsonFile } from '../utils/fileHandler.js';


export const processCheckout = async (req, res) => {
    const { userId: bodyUserId, planId } = req.body;
    const targetUserId = bodyUserId ?? req.userId;
    if (!targetUserId) {
        return res.status(400).json({ success: false, message: 'userId required' });
    }
    if (targetUserId !== req.userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    try {
        const plans = await dataService.getPlans();
        const selectedPlan = plans.find(p => p.id === planId);

        if (!selectedPlan) {
            return res.status(400).json({ success: false, message: 'Invalid plan selected' });
        }

        // Simulate payment success (no real gateway)
        // TODO: Replace with Real Payment API (Stripe, Easypaisa, etc.)

        // Firestore `users/{uid}` is the wallet source of truth used by gameplay and UserSync.
        const updatedFirestoreProfile = await userFirestoreAdmin.addCoins(
            targetUserId,
            Number(selectedPlan.coins || 0)
        );
        // Keep legacy json mirror best-effort to avoid breaking old compatibility paths.
        await dataService.addUserCoins(targetUserId, selectedPlan.coins).catch(() => {});

        res.json({
            success: true,
            message: "Payment successful",
            updatedCoins: Number(updatedFirestoreProfile?.coins ?? 0)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Checkout failed', error: error.message });
    }
};

const GAMES_FILE = dataService.GAMES_FILE;

export const createGame = async (req, res) => {
    try {
        const { gameId, players } = req.body;
        let newGame;
        await safeReadWrite(GAMES_FILE, async (games) => {
            const newGameInner = {
                gameId,
                players: players.map((p) => ({
                    id: p.id,
                    name: p.name,
                    score: 0,
                    successCount: 0,
                    failureCount: 0,
                    isQuit: false
                })),
                status: 'active',
                winner: null
            };
            games.push(newGameInner);
            newGame = newGameInner;
            return games;
        });
        res.status(201).json(newGame);
    } catch (error) {
        res.status(500).json({ message: 'Error creating game', error: error.message });
    }
};

export const updateScore = async (req, res) => {
    try {
        const { gameId, playerId, score, successCount, failureCount } = req.body;
        if (!req.userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!gameId || !playerId) {
            return res.status(400).json({ message: 'gameId and playerId are required' });
        }
        if (String(playerId) !== String(req.userId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        let updatedGame;
        await safeReadWrite(GAMES_FILE, async (games) => {
            const gameIndex = games.findIndex(g => g.gameId === gameId);

            if (gameIndex === -1) {
                throw new Error('GAME_NOT_FOUND');
            }

            const playerIndex = games[gameIndex].players.findIndex(p => p.id === playerId);
            if (playerIndex === -1) {
                throw new Error('PLAYER_NOT_FOUND');
            }

            games[gameIndex].players[playerIndex].score = score;
            if (successCount !== undefined) games[gameIndex].players[playerIndex].successCount = successCount;
            if (failureCount !== undefined) games[gameIndex].players[playerIndex].failureCount = failureCount;

            updatedGame = games[gameIndex];
            return games;
        });
        res.json(updatedGame);
    } catch (error) {
        if (error.message === 'GAME_NOT_FOUND') {
            return res.status(404).json({ message: 'Game not found' });
        }
        if (error.message === 'PLAYER_NOT_FOUND') {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.status(500).json({ message: 'Error updating score', error: error.message });
    }
};

export const quitGame = async (req, res) => {
    try {
        const { gameId, playerId, successCount, failureCount, score } = req.body;
        if (!req.userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!gameId || !playerId) {
            return res.status(400).json({ message: 'gameId and playerId are required' });
        }
        if (String(playerId) !== String(req.userId)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        let gameOut;
        await safeReadWrite(GAMES_FILE, async (games) => {
            const gameIndex = games.findIndex(g => g.gameId === gameId);

            if (gameIndex === -1) {
                throw new Error('GAME_NOT_FOUND');
            }

            const game = games[gameIndex];
            const playerIndex = game.players.findIndex(p => p.id === playerId);

            if (playerIndex === -1) {
                throw new Error('PLAYER_NOT_FOUND');
            }

            game.players[playerIndex].score = score || game.players[playerIndex].score;
            if (successCount !== undefined) game.players[playerIndex].successCount = successCount;
            if (failureCount !== undefined) game.players[playerIndex].failureCount = failureCount;

            game.players[playerIndex].isQuit = true;
            game.status = 'finished';

            const calculatePerformance = (p) => {
                const xp = Math.floor(p.score * 0.1) + (p.successCount * 5);
                const coins = Math.floor(p.score * 0.5) + (p.successCount * 2) - (p.failureCount * 1);
                return xp + Math.max(0, coins);
            };

            const p1Perf = calculatePerformance(game.players[0]);
            const p2Perf = calculatePerformance(game.players[1]);

            if (p1Perf > p2Perf) {
                game.winner = game.players[0].id;
            } else if (p2Perf > p1Perf) {
                game.winner = game.players[1].id;
            } else {
                game.winner = 'draw';
            }

            gameOut = game;
            return games;
        });
        res.json(gameOut);
    } catch (error) {
        if (error.message === 'GAME_NOT_FOUND') {
            return res.status(404).json({ message: 'Game not found' });
        }
        if (error.message === 'PLAYER_NOT_FOUND') {
            return res.status(404).json({ message: 'Player not found' });
        }
        res.status(500).json({ message: 'Error quitting game', error: error.message });
    }
};

export const getGame = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { id } = req.params;
        const games = await readJsonFile(GAMES_FILE);
        const game = games.find(g => g.gameId === id);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const participantIds = Array.isArray(game.players) ? game.players.map((p) => String(p.id)) : [];
        if (!participantIds.includes(String(req.userId))) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        res.json(game);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching game', error: error.message });
    }
};

