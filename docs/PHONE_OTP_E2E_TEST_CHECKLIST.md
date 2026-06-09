## Phone OTP E2E test checklist (pre-release)

### A) Setup
- Confirm Firebase Console setup in `docs/FIREBASE_PHONE_AUTH_PRODUCTION_CHECKLIST.md`.
- Use a clean browser profile (no extensions) for baseline.
- For dev test numbers: configure Firebase test phone numbers + set `VITE_FIREBASE_DISABLE_APP_VERIFICATION=true` (dev only).

### B) Happy path (real phone)
1. Step 1: Sign up with email/password.
2. Step 2: Enter the same email in the confirm field + enter DOB.
3. Observe: “Sending SMS…” completes and OTP modal opens.
4. Enter OTP received on the phone.
5. Observe: account completes and navigates to `/`.

### C) Pakistan phone input formats
Run the same test with these inputs (should normalize to E.164 correctly):
- `03XXXXXXXXX`
- `+923XXXXXXXXX`
- `923XXXXXXXXX`
- `00923XXXXXXXXX`

### D) Resend behavior
1. Request OTP.
2. Before cooldown expires, verify resend is blocked.
3. After cooldown, resend:
   - Verify only one code is valid (old code should fail).
   - Verify no duplicate reCAPTCHA widget issues appear.

### E) Refresh / persistence
1. Complete Step 1 and reach Step 2.
2. Refresh the page.
3. Attempt Step 2 send again.
   - Expected: `auth.currentUser` is still present (local persistence).
   - If user is null, investigate storage/cookies blocking or persistence config.

### F) Visible reCAPTCHA fallback
Goal: confirm the visible fallback host works when invisible fails.
- Trigger scenario (common): browser privacy mode, strict tracking prevention, or App Check misconfig.
- Expected: the visible widget renders inside the fallback container and allows retry.

### G) Error mapping smoke tests
Verify UI shows clear messages for:
- `auth/invalid-phone-number`
- `auth/too-many-requests`
- `auth/quota-exceeded`
- `auth/unauthorized-domain`
- `auth/captcha-check-failed`
- `auth/invalid-verification-code`
- `auth/code-expired`

### H) Cross-browser/device
- Desktop: Chrome + Firefox
- Mobile: Android Chrome and/or iOS Safari
- Optional: slow network simulation (3G) for resend/confirm stability

