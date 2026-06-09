import { auth } from '../firebase/config.js';
import { getUser } from '../services/userService.js';

/** Firebase-only user id source. */
export function getJwtUserId() {
    // OLD BACKEND (DISABLED - MIGRATED TO FIREBASE)
    // Legacy JWT `sub` fallback removed in runtime path.
    return auth.currentUser?.uid ?? null;
}

/**
 * Build game user from Firebase Auth + Firestore profile (no /api and no localStorage).
 */
export async function ensureGameUserFromAuth() {
    const id = getJwtUserId();
    if (!id) return null;
    try {
        // OLD BACKEND (DISABLED - MIGRATED TO FIREBASE)
        // const res = await fetch(`/api/user/${id}`);
        // if (!res.ok) return null;
        // const row = await res.json();
        const row = await getUser(id);
        if (!row) return null;
        const gameUser = {
            uid: id,
            displayName: row.displayName || row.name || row.username || 'Player',
            photoURL: row.photoURL || '',
            email: row.email ?? null,
            xp: Number(row.xp ?? 0),
            coins: Number(row.coins ?? 0),
        };
        return gameUser;
    } catch {
        return null;
    }
}
