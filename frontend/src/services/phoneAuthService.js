import { RecaptchaVerifier, linkWithPhoneNumber } from 'firebase/auth';
import { authDiag } from '../utils/authDiagnostics.js';

/** Delay after `clear()` so the next verifier can bind to the same container (avoids "already rendered"). */
const RECAPTCHA_RESET_MS = 120;

/** When invisible reCAPTCHA fails with these codes, retry once with a visible widget (different DOM node). */
const CAPTCHA_FALLBACK_CODES = new Set([
    'auth/captcha-check-failed',
    'auth/invalid-app-credential',
    'auth/missing-app-credential',
]);

/**
 * @param {string | undefined} e164
 * @returns {string}
 */
export function maskE164ForLogs(e164) {
    const s = String(e164 || '');
    if (s.length < 9) return '***';
    return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

/**
 * @param {import('firebase/auth').RecaptchaVerifier | null | undefined} verifier
 */
export async function disposeRecaptchaVerifier(verifier) {
    if (!verifier) return;
    try {
        verifier.clear();
    } catch (e) {
        console.warn('[phoneAuth] recaptcha clear failed', e?.message || e);
    }
    await new Promise((r) => setTimeout(r, RECAPTCHA_RESET_MS));
}

/**
 * @param {import('firebase/auth').Auth} auth
 * @param {import('firebase/auth').User} user
 * @param {string} e164
 * @param {string} containerId
 * @param {'invisible' | 'normal'} size
 */
async function attemptPhoneLinkOnce(auth, user, e164, containerId, size) {
    if (typeof document === 'undefined' || !document.getElementById(containerId)) {
        throw new Error(`reCAPTCHA container #${containerId} missing from DOM`);
    }

    const recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
        size,
        callback: () => {
            console.debug('[phoneAuth] reCAPTCHA solved', { size });
        },
        'expired-callback': () => {
            console.warn('[phoneAuth] reCAPTCHA expired — request a new code');
        },
    });

    try {
        const widgetId = await recaptchaVerifier.render();
        console.debug('[phoneAuth] reCAPTCHA render ok', { containerId, size, widgetId });
    } catch (e) {
        console.error('[phoneAuth] reCAPTCHA render failed', e?.code || '', e?.message || e);
        await disposeRecaptchaVerifier(recaptchaVerifier);
        throw e;
    }

    try {
        const confirmationResult = await linkWithPhoneNumber(user, e164, recaptchaVerifier);
        return { confirmationResult, recaptchaVerifier };
    } catch (e) {
        console.error('[phoneAuth] linkWithPhoneNumber failed', {
            code: e?.code,
            message: e?.message,
            containerId,
            size,
        });
        await disposeRecaptchaVerifier(recaptchaVerifier);
        throw e;
    }
}

/**
 * Sends SMS for `linkWithPhoneNumber` with reCAPTCHA.
 * Tries **invisible** first; on captcha/app-credential errors, retries with **visible** on `visibleFallbackContainerId` if provided.
 *
 * @param {import('firebase/auth').Auth} auth
 * @param {import('firebase/auth').User} user
 * @param {string} e164 E.164, e.g. +923001234567
 * @param {string} invisibleContainerId
 * @param {import('firebase/auth').RecaptchaVerifier | null | undefined} previousVerifier
 * @param {string | null | undefined} visibleFallbackContainerId - optional second DOM id for `size: 'normal'`
 * @returns {Promise<{ confirmationResult: import('firebase/auth').ConfirmationResult, recaptchaVerifier: import('firebase/auth').RecaptchaVerifier }>}
 */
export async function sendPhoneLinkSms(
    auth,
    user,
    e164,
    invisibleContainerId,
    previousVerifier,
    visibleFallbackContainerId = null
) {
    authDiag('info', 'phone_link_send_start', {
        maskedPhone: maskE164ForLogs(e164),
        uidPrefix: String(user?.uid || '').slice(0, 8),
        invisibleContainerId,
        hasFallback: !!visibleFallbackContainerId,
    });

    await disposeRecaptchaVerifier(previousVerifier);

    if (typeof document === 'undefined' || !document.getElementById(invisibleContainerId)) {
        const msg = `reCAPTCHA container #${invisibleContainerId} missing from DOM`;
        console.error('[phoneAuth]', msg);
        throw new Error(msg);
    }

    try {
        const result = await attemptPhoneLinkOnce(auth, user, e164, invisibleContainerId, 'invisible');
        authDiag('info', 'phone_link_challenge_ok', {
            maskedPhone: maskE164ForLogs(e164),
            mode: 'invisible',
        });
        return result;
    } catch (e) {
        const code = e?.code || '';
        const hasVisibleHost =
            visibleFallbackContainerId && typeof document !== 'undefined'
                ? document.getElementById(visibleFallbackContainerId)
                : null;
        const canFallback = hasVisibleHost && CAPTCHA_FALLBACK_CODES.has(code);

        if (!canFallback) {
            authDiag('error', 'phone_link_send_failed', {
                maskedPhone: maskE164ForLogs(e164),
                code: String(code),
                hasVisibleFallback: !!hasVisibleHost,
            });
            throw e;
        }

        authDiag('warn', 'phone_link_invisible_failed_retry_visible', {
            maskedPhone: maskE164ForLogs(e164),
            code: String(code),
        });
        await new Promise((r) => setTimeout(r, RECAPTCHA_RESET_MS));

        try {
            const result = await attemptPhoneLinkOnce(auth, user, e164, visibleFallbackContainerId, 'normal');
            authDiag('info', 'phone_link_challenge_ok', {
                maskedPhone: maskE164ForLogs(e164),
                mode: 'visible',
            });
            return result;
        } catch (e2) {
            authDiag('error', 'phone_link_visible_fallback_failed', {
                maskedPhone: maskE164ForLogs(e164),
                code: String(e2?.code || ''),
            });
            throw e2;
        }
    }
}
