## Secure fallback design when SMS OTP delivery fails

### Why a client-side “mock OTP” is not allowed in production

Firebase phone verification is a proof of phone ownership. A client-side mock code would allow any user to bypass ownership checks and link/verify a phone number without receiving SMS.

If you need a fallback, it must be **server-controlled** and auditable.

### Recommended fallback options (pick one)

#### Option A: Firebase test phone numbers (development only)
- Firebase Console → Authentication → Phone → Test phone numbers
- Client dev flag: `VITE_FIREBASE_DISABLE_APP_VERIFICATION=true`
- Pros: fastest dev iteration, no carrier dependency
- Cons: not for production

#### Option B: Support-assisted verification (production)
- User reports delivery failure.
- Support verifies identity (KYC/CS flow) and triggers a backend action:
  - Set `users/{uid}.phoneVerifiedBySupport=true` in Firestore
  - Allow linking phone via server-side process or allow app access without phone link (policy decision)
- Pros: secure and controlled
- Cons: operational overhead

#### Option C: Email-based fallback (production)
- If SMS fails, offer **email verification** as the second factor:
  - Send sign-in link to the email on file
  - Require email verification completion before allowing gameplay/wallet creation
- Pros: automated, secure
- Cons: changes your trust model (phone not verified)

#### Option D: Backup codes (production, server-issued)
- After a successful phone verification (at least once), issue a set of one-time backup codes (server-generated).
- Store hashed codes on server; allow users to use them only when SMS fails.
- Pros: best UX for repeat users
- Cons: more implementation work

### Implementation outline (Option B or D)

1. Add a backend endpoint to request fallback:
   - `POST /api/auth/phone-otp-fallback/request`
   - Rate limit by IP + uid, log request, do not reveal whether a number is valid.

2. Add an admin-only action to approve:
   - `POST /api/admin/phone-otp-fallback/approve`
   - Requires admin auth, writes an audit log.

3. Client UX:
   - After 2 resend attempts or 1 captcha failure, show “Need help?” panel.
   - Never accept a client-only OTP for Firebase phone linking.

### Minimum security controls
- Rate limiting + abuse monitoring
- Audit logging (uid, timestamps, decision)
- No OTP/code values logged anywhere
- Explicit environment separation (dev vs prod)

