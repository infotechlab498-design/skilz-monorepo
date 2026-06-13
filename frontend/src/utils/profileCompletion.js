/** Post-OAuth signup redirect — profile completion without OTP. */

export const OAUTH_SIGNUP_PROFILE_PATH = '/player/profile?complete=1';

/** Billing / checkout gate — phone + CNIC required. */

export const BILLING_PROFILE_PATH = '/player/profile?complete=billing';

function toStr(v) {
  return String(v ?? '').trim();
}

/**
 * Unique-enough username for new OAuth users (editable on profile page).
 * 
 * @param {{ uid?: string, email?: string, displayName?: string } | null | undefined} identity
 */
export function suggestUsernameFromIdentity(identity) {
  const uid = toStr(identity?.uid);
  const email = toStr(identity?.email);
  const displayName = toStr(identity?.displayName);
  const raw =
    displayName || (email.includes('@') ? email.split('@')[0] : 'player');
  let sanitized = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 16).toLowerCase();
  if (!sanitized) sanitized = 'player';
  const suffix = uid ? uid.slice(-6) : Math.random().toString(36).slice(2, 8);
  return `${sanitized}_${suffix}`;
}

/**
 * Basic profile: enough for games, dashboard, and display identity.
 * @param {Record<string, unknown> | null | undefined} profile
 */
export function isProfileBasicComplete(profile) {
  const username = toStr(profile?.username);
  const email = toStr(profile?.email);
  const name =
    toStr(profile?.fullName) ||
    toStr(profile?.name) ||
    toStr(profile?.displayName);
  return !!(username && email && name);
}

/**
 * Billing gate: phone + CNIC (Sprint 2 checkout will use this).
 * @param {Record<string, unknown> | null | undefined} profile
 */
export function isProfileBillingComplete(profile) {
  if (!isProfileBasicComplete(profile)) return false;
  const phone = toStr(profile?.phoneLocal) || toStr(profile?.phone);
  const cnic = toStr(profile?.cnic);
  return !!(phone && cnic);
}

/**
 * @param {Record<string, unknown> | null | undefined} profile
 */
export function resolveProfileComplete(profile) {
  if (profile?.profileComplete === true) return true;
  if (profile?.profileComplete === false) return false;
  return isProfileBasicComplete(profile);
}

/** True when basic profile or billing fields still need attention. */
export function needsProfileAttention(profile) {
  return !resolveProfileComplete(profile) || !isProfileBillingComplete(profile);
}

/**
 * @param {Record<string, unknown> | null | undefined} profile
 * @returns {string | null}
 */
export function getProfileAttentionMessage(profile) {
  if (!resolveProfileComplete(profile)) {
    return 'Complete your username and email on your profile.';
  }
  if (!isProfileBillingComplete(profile)) {
    return 'Add phone and CNIC to unlock coin purchases and billing.';
  }
  return null;
}
