/**
 * Re-exports Firebase app + Auth + Firestore from the single init in `src/firebase/config.js`.
 * Import from here (`services/firebase`) or from `firebase/config` — same instances.
 */
export { default, auth, db, firestore, rtdb } from '../firebase/config.js';
