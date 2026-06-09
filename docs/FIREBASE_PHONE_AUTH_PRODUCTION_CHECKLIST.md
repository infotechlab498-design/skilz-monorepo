## Firebase Phone OTP production checklist (Skilz)

This project links a phone number to a signed-in email/password user via Firebase Auth:

- Email signup: `createUserWithEmailAndPassword`
- Phone link: `linkWithPhoneNumber(currentUser, e164, recaptchaVerifier)`
- OTP verify: `confirmationResult.confirm(code)`

### 1) Firebase Console configuration (must be correct)

- **Authentication → Sign-in method**
  - **Email/Password**: Enabled
  - **Phone**: Enabled

- **Authentication → Settings → Authorized domains**
  - Add **every** domain you run the web app on:
    - `localhost`
    - production domain (e.g. `skilz.com`)
    - preview/staging domains (e.g. Vercel/Netlify previews)
  - If missing, phone auth often fails with `auth/unauthorized-domain`.

- **Billing / Blaze**
  - Verify Blaze is active.
  - Check Firebase/Google Cloud for any **SMS quota** or billing restrictions.
  - If quota is exceeded, expect `auth/quota-exceeded` or throttling behavior.

- **App Check (if you enabled enforcement)**
  - If App Check is enforced for Authentication, configure it for the web app.
  - Common failure codes when misconfigured: `auth/invalid-app-credential`, `auth/missing-app-credential`.

### 2) Supported phone formats (Pakistan)

The UI accepts Pakistan mobile numbers in local format:

- `03XXXXXXXXX` (11 digits)

The code converts to E.164:

- `+923XXXXXXXXX`

Also accepted by the converter:

- `+923…`
- `923…`
- `00923…`

### 3) Known “SMS not received” causes (not code bugs)

- Carrier delay / filtering / DND
- Regional delivery issues
- Firebase project SMS quota / throttling
- Test number not configured (in dev)

If `linkWithPhoneNumber` succeeds, Firebase issued the SMS challenge; delivery can still fail at the carrier level.

### 4) Dev testing without real SMS (recommended)

Use Firebase **Test phone numbers**:

- Firebase Console → Authentication → **Phone** → **Test phone numbers**
- Then in `.env` (dev only):
  - `VITE_FIREBASE_DISABLE_APP_VERIFICATION=true`

This sets `auth.settings.appVerificationDisabledForTesting = true` in dev builds only.

### 5) Security notes

- Do **not** implement a client-side “mock OTP” for Firebase phone auth in production.
  - It would allow bypassing phone ownership verification.
- A production fallback must be **server-controlled** (support flow, email-based verification, or other verified factor).

