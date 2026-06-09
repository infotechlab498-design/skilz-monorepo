import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase/config.js";
import {
  DEFAULT_USER_GAMES,
  DEFAULT_USER_STATS,
  DEFAULT_USER_STATS_EXTRA,
} from "../constants/userProfileDefaults.js";
import { authDiag } from "../utils/authDiagnostics.js";
import { toSerializableFirebase } from "./userService.js";

function cloneGamesDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_USER_GAMES));
}

/**
 * Create or update the Firestore user profile at `users/{uid}`.
 *
 * @param {{
 *  uid: string,
 *  email: string,
 *  username: string,
 *  fullName?: string,
 *  phoneLocal: string,
 *  phoneE164: string,
 *  cnic: string,
 *  location?: string,
 *  dob: { year: string, month: string, day: string },
 *  photoURL?: string,
 * }} p
 */
export async function createUserProfile(p) {
  const uid = String(p?.uid || "");
  if (!uid) throw new Error("Missing uid");
  const email = String(p?.email || "").trim();
  const username = String(p?.username || "").trim();
  const fullName = String(p?.fullName || username || "Player").trim() || "Player";
  const phoneLocal = String(p?.phoneLocal || "").trim();
  const phoneE164 = String(p?.phoneE164 || "").trim();
  const cnic = String(p?.cnic || "").trim();
  const location = String(p?.location || "").trim();
  const photoURL = String(p?.photoURL || "").trim();

  const y = String(p?.dob?.year || "").trim();
  const m = String(p?.dob?.month || "").trim();
  const d = String(p?.dob?.day || "").trim();
  const dob = y && m && d ? `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}` : "";

  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  const isNew = !snap.exists();

  authDiag("info", "firestore_profile_upsert_start", { uidPrefix: uid.slice(0, 8) });

  /** @type {Record<string, unknown>} */
  const payload = {
    uid,
    email,
    fullName,
    name: fullName,
    username,
    displayName: fullName,
    phone: phoneLocal,
    phoneE164,
    phoneLocal,
    cnic,
    location,
    photoURL,
    dob,
    updatedAt: serverTimestamp(),
  };

  if (isNew) {
    payload.source = "email_signup";
    payload.coins = 200;
    payload.xp = 0;
    payload.level = 1;
    payload.earnedCoins = 200;
    payload.dailyStreak = 0;
    payload.lastPlayedDate = "";
    payload.games = cloneGamesDefaults();
    payload.stats = { ...DEFAULT_USER_STATS, ...DEFAULT_USER_STATS_EXTRA };
    payload.createdAt = serverTimestamp();
  }

  await setDoc(ref, payload, { merge: true });
  authDiag("info", "firestore_profile_upsert_ok", { uidPrefix: uid.slice(0, 8) });
}

/**
 * Fetch profile from `users/{uid}`.
 * @param {string} uid
 */
export async function getUserProfile(uid) {
  const u = String(uid || "");
  if (!u) return null;
  const ref = doc(db, "users", u);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return toSerializableFirebase({ id: u, ...snap.data() });
}
