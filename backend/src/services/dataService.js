import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { lock } from 'proper-lockfile';
import bcrypt from 'bcryptjs';
import { DATA_DIR } from '../config/paths.js';

// =============================================================
// FIREBASE (FUTURE — DO NOT ACTIVATE YET)
// ---------------------------------------------------------------
// import { initializeApp } from "firebase/app";
// import { getFirestore, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
// const firebaseConfig = {
//   apiKey: "YOUR_KEY",
//   authDomain: "YOUR_DOMAIN.firebaseapp.com",
//   projectId: "YOUR_PROJECT_ID",
// };
// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);
// =============================================================

export { DATA_DIR };
const PLANS_FILE = path.join(DATA_DIR, 'plans.json');
export const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ROOMS_FILE = path.join(DATA_DIR, 'game_rooms.json');
const INVITATIONS_FILE = path.join(DATA_DIR, 'invitations.json');
export const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
export const GAMES_FILE = path.join(DATA_DIR, 'games.json');

// --- Ensure all JSON files exist on startup ---
export const ensureDataFiles = async () => {
    const defaults = {
        [USERS_FILE]: [],
        [ROOMS_FILE]: [],
        [INVITATIONS_FILE]: [],
        [PLANS_FILE]: [],
        [SCORES_FILE]: [],
        [GAMES_FILE]: [],
    };
    for (const [file, def] of Object.entries(defaults)) {
        try {
            await fs.access(file);
        } catch {
            await fs.writeFile(file, JSON.stringify(def, null, 2), 'utf-8');
            console.log(`[DataService] Created missing file: ${path.basename(file)}`);
        }
    }
};

// --- Safe atomic read-modify-write with file locking ---
const safeWrite = async (filePath, updateFn) => {
    // Ensure file exists before locking
    try {
        await fs.access(filePath);
    } catch {
        await fs.writeFile(filePath, '[]', 'utf-8');
    }

    const release = await lock(filePath, { retries: { retries: 5, minTimeout: 50 } });
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(raw || '[]');
        const updated = await updateFn(data);
        await fs.writeFile(filePath, JSON.stringify(updated, null, 2), 'utf-8');
        return updated;
    } finally {
        await release();
    }
};

// Safe read-only (no locking needed for reads; concurrent writes handled by safeWrite)
const readFile = async (filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data || '[]');
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
};

// --- Plans ---
export const getPlans = async () => readFile(PLANS_FILE);

// --- Users ---
export const getUsers = async () => readFile(USERS_FILE);

export const getUserById = async (id) => {
    const users = await getUsers();
    return users.find(u => u.id === id) || null;
};

/** Resolve Firebase/social `uid` or canonical `id` to the same user record. */
export const getUserByIdOrUid = async (idOrUid) => {
    const users = await getUsers();
    return (
        users.find(u => u.id === idOrUid || u.uid === idOrUid) || null
    );
};

export const getUserByEmail = async (email) => {
    const users = await getUsers();
    return users.find(u => u.email === email) || null;
};

export const getUserByUsername = async (username) => {
    const users = await getUsers();
    return users.find(u => u.username === username) || null;
};

export const registerUser = async (userData) => {
    let newUser;
    await safeWrite(USERS_FILE, (users) => {
        const id = userData.id;
        const uid = userData.uid;
        const existingIdx = users.findIndex(
            (u) =>
                (id != null && id !== '' && (u.id === id || u.uid === id)) ||
                (uid != null && uid !== '' && (u.id === uid || u.uid === uid))
        );
        if (existingIdx >= 0) {
            newUser = users[existingIdx];
            return users;
        }

        // Hash password if provided
        const password = userData.password
            ? bcrypt.hashSync(userData.password, 10)
            : undefined;

        newUser = {
            id: userData.id || uuidv4(),
            xp: 0,
            coins: 200,
            total_matches: 0,
            wins: 0,
            created_at: new Date().toISOString(),
            ...userData,
            ...(password ? { password } : {}),
        };
        users.push(newUser);
        return users;
    });
    // Return user without exposing hashed password to caller
    const { password: _pw, ...safeUser } = newUser;
    return safeUser;
};

export const authenticateUser = async (identifier, password) => {
    const users = await getUsers();
    const user = users.find(
        u => u.email === identifier || u.username === identifier
    );
    if (!user) return null;

    // Support both bcrypt hashes and plain-text legacy passwords during migration
    const isHashed = user.password && user.password.startsWith('$2');
    const match = isHashed
        ? bcrypt.compareSync(password, user.password)
        : user.password === password; // legacy fallback

    if (!match) return null;
    const { password: _pw, ...safeUser } = user;
    return safeUser;
};

export const addUserCoins = async (userId, coinsToAdd) => {
    const parsed = Number(coinsToAdd);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('coinsToAdd must be a positive number');
    }
    let newBalance;
    await safeWrite(USERS_FILE, (users) => {
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) throw new Error('User not found');
        users[idx].coins = (users[idx].coins || 0) + parsed;
        newBalance = users[idx].coins;
        return users;
    });
    return newBalance;
};

export const deductUserCoins = async (userId, amount) => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error('amount must be a positive number');
    }
    let newBalance;
    await safeWrite(USERS_FILE, (users) => {
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) throw new Error('User not found');
        if ((users[idx].coins || 0) < parsed) throw new Error('Insufficient coins');
        users[idx].coins -= parsed;
        newBalance = users[idx].coins;
        return users;
    });
    return newBalance;
};

/**
 * Merge arbitrary stats onto a user. Accumulates numeric fields prefixed with
 * `xp_earned` and `coins_earned` correctly instead of writing them as-is.
 */
const REWARD_WIN_COINS = 50;
const REWARD_WIN_XP = 30;
const REWARD_LOSE_COINS = 10;
const REWARD_DRAW_COINS = 10;
const MAX_HISTORY_GAMES = 20;

/**
 * Canonical match reward math (shared by users.json path + Firestore fallback).
 * @param {string} result — 'win' | 'lose' | 'draw'
 * @param {string} [gameType]
 * @param {number} [score]
 */
export function getMatchRewardEconomy(result, gameType = 'unknown', score = 0) {
  const normResult = result === 'win' ? 'win' : result === 'draw' ? 'draw' : 'lose';
  const historyEntry = {
    gameType: gameType || 'unknown',
    result: normResult,
    score: Number(score) || 0,
    date: new Date().toISOString(),
  };

  let coinsDelta = REWARD_LOSE_COINS;
  let xpDelta = 0;
  if (normResult === 'win') {
    coinsDelta = REWARD_WIN_COINS;
    xpDelta = REWARD_WIN_XP;
  } else if (normResult === 'draw') {
    coinsDelta = REWARD_DRAW_COINS;
  }

  const coinsEarned = normResult === 'win' ? REWARD_WIN_COINS : REWARD_DRAW_COINS;
  const xpEarned = normResult === 'win' ? REWARD_WIN_XP : 0;

  return {
    normResult,
    historyEntry,
    coinsDelta,
    xpDelta,
    reward: { coinsEarned, xpEarned },
  };
}

/**
 * Post-match rewards + rolling game history (persisted in users.json array).
 * Resolves user by canonical `id` or `uid`. WIN: +50 coins, +30 XP. LOSE/DRAW: +10 coins.
 */
export const recordGameReward = async (idOrUid, { gameType, result, score }) => {
  const { normResult, historyEntry, coinsDelta, xpDelta, reward } = getMatchRewardEconomy(
    result,
    gameType,
    score
  );

    let updatedUser;
    await safeWrite(USERS_FILE, (users) => {
        const idx = users.findIndex(u => u.id === idOrUid || u.uid === idOrUid);
        if (idx === -1) throw new Error('User not found');

        const user = users[idx];
        if (!Array.isArray(user.history)) user.history = [];

        user.coins = (user.coins || 0) + coinsDelta;
        user.xp = (user.xp || 0) + xpDelta;
        user.total_matches = (user.total_matches || 0) + 1;
        if (normResult === 'win') user.wins = (user.wins || 0) + 1;

        user.history.push(historyEntry);
        if (user.history.length > MAX_HISTORY_GAMES) {
            user.history = user.history.slice(-MAX_HISTORY_GAMES);
        }

        users[idx] = user;
        updatedUser = user;
        return users;
    });

    const { password: _pw, ...safe } = updatedUser;
    return {
        ...safe,
        _reward: reward,
    };
};

export const updateUserStats = async (userId, stats) => {
    let updatedUser;
    await safeWrite(USERS_FILE, (users) => {
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) throw new Error('User not found');

        const user = users[idx];

        // Accumulate special reward fields instead of overwriting
        if (stats.coins_earned != null) {
            user.coins = (user.coins || 0) + stats.coins_earned;
            delete stats.coins_earned;
        }
        if (stats.xp_earned != null) {
            user.xp = (user.xp || 0) + stats.xp_earned;
            delete stats.xp_earned;
        }

        users[idx] = { ...user, ...stats };
        updatedUser = users[idx];
        return users;
    });
    const { password: _pw, ...safeUser } = updatedUser;
    return safeUser;
};

// --- Game Rooms ---
export const getRooms = async () => readFile(ROOMS_FILE);

export const saveRooms = async (rooms) => {
    await safeWrite(ROOMS_FILE, () => rooms);
};

export const createRoom = async (roomData) => {
    let newRoom;
    await safeWrite(ROOMS_FILE, (rooms) => {
        newRoom = {
            id: uuidv4(),
            status: 'waiting',
            created_at: new Date().toISOString(),
            ...roomData,
        };
        rooms.push(newRoom);
        return rooms;
    });
    return newRoom;
};

export const getRoomById = async (id) => {
    const rooms = await getRooms();
    return rooms.find(r => r.id === id) || null;
};

export const updateRoomStatus = async (roomId, status) => {
    let updatedRoom;
    await safeWrite(ROOMS_FILE, (rooms) => {
        const room = rooms.find(r => r.id === roomId);
        if (!room) throw new Error('Room not found');
        room.status = status;
        updatedRoom = room;
        return rooms;
    });
    return updatedRoom;
};

// --- Invitations ---
export const getInvitations = async () => readFile(INVITATIONS_FILE);

export const createInvitation = async (invitationData) => {
    let newInv;
    await safeWrite(INVITATIONS_FILE, (invitations) => {
        newInv = {
            id: uuidv4(),
            status: 'pending',
            created_at: new Date().toISOString(),
            ...invitationData,
        };
        invitations.push(newInv);
        return invitations;
    });
    return newInv;
};
