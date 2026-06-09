/** DOM id for Firebase invisible RecaptchaVerifier (must match a present, stable node). */
export const RECAPTCHA_CONTAINER_ID = 'recaptcha-container';

/**
 * Second container for visible reCAPTCHA when invisible fails (captcha / app credential errors).
 * Must exist in the DOM when fallback runs; do not share the same element id as invisible.
 */
export const RECAPTCHA_VISIBLE_FALLBACK_ID = 'recaptcha-container-visible';

/** Cooldown (seconds) shown in OTP UI — keep in sync with SignUpOtp defaults. */
export const FIREBASE_OTP_RESEND_COOLDOWN_SEC = 60;
