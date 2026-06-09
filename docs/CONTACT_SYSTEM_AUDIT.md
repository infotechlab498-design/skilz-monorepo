# Contact + Email Reply + Admin Dashboard — System Audit Report

**Scope:** Verification only (React, Express, Firestore Admin SDK, Nodemailer + SMTP e.g. Brevo).  
**Audited against:** Repository state at audit time.  
**Auditor role:** Full-stack verification checklist.

---

## Executive summary

| Area | Verdict |
|------|---------|
| Contact form → API → Firestore | **Implemented** |
| Admin list + detail + PATCH | **Implemented** |
| Admin email reply (SMTP) | **Implemented** (route name differs from some checklists — see §7) |
| No client Firestore writes for submissions | **OK** (public uses Express only; rules block client `create`) |
| Rate limit on public POST | **Present** |
| Secrets in frontend | **None found** |

**Manual E2E** (submit → Firestore → admin UI → send reply → inbox) must still be run in your environment with real SMTP credentials.

---

## Step 1 — Contact form flow (frontend)

**File:** `frontend/src/contact/ContactForm.jsx`

| Check | Result |
|-------|--------|
| Real API call to `/api/contact` | **Yes** — `api.submitContact(...)` in `handleSubmit` (lines 64–71). |
| No fake `setTimeout` | **Confirmed** — no simulated delay. |
| Fields | `firstName`, `lastName`, `email`, `message`, honeypot `website`. |
| Client validation | **Yes** — `validate()` lines 23–46 (required + simple email regex). |
| Loading state | **Yes** — `loading` / disabled submit (lines 61–62, 88–89, 192–194). |
| Error handling | **Yes** — `_form` error from catch (lines 81–86); field errors from `validate`. |
| Success only after API success | **Yes** — `setSuccess(true)` only after `await api.submitContact` resolves (lines 73–74). |

**`api.submitContact`** (`frontend/src/services/api.js`): `POST` `${API_BASE}/contact` → `/api/contact` when `API_BASE` is `/api`.

### Gaps (non-blocking)

- **Email regex:** Client uses `/\S+@\S+\.\S+/`; server uses stricter `EMAIL_REGEX` in `backend/src/middleware/validation.js`. Invalid addresses may pass client-side then fail server-side (acceptable).
- **Message max length:** No client-side cap; server enforces **5000** chars (`validation.js`). Optional UX: mirror max length in the textarea.

**Step 1 verdict:** **PASS**

---

## Step 2 — Backend contact API

**Route:** `POST /api/contact`  
**Files:** `backend/src/routes/contactRoutes.js`, `backend/src/controllers/contactController.js`, `backend/src/server.js` (mount `app.use('/api', contactRoutes)`).

| Check | Result |
|-------|--------|
| Validation | **Yes** — `validateContactPayload` (required fields, email regex, max lengths, honeypot). |
| Firestore write | **Admin SDK** — `getAdminFirestore()` + `collection('contactMessages').add(...)`. **Not** client SDK. |
| Collection | `contactMessages` |
| Fields on create | `firstName`, `lastName`, `email`, `message`, `status: 'new'`, `source`, `adminNotes`, `replyBody`, `replyEmailLastError`, `userAgent`, `ipHash`, `createdAt`, `updatedAt` (server timestamps). |
| `createdAt` | **Yes** — `FieldValue.serverTimestamp()`. |

**Step 2 verdict:** **PASS**

---

## Step 3 — Firestore security rules

**File:** `backend/firebase/firestore.rules` — `match /contactMessages/{messageId}`

```
allow create: if false;
allow read, update: if isAdmin();
allow delete: if false;
```

| Check | Result |
|-------|--------|
| Public / anonymous **create** | **Blocked** (`create: false`). |
| Direct client creates | **Not allowed** — submissions must go through Express + Admin SDK. |
| Client writes | **No general write** — only `read`/`update` for `isAdmin()` (defense-in-depth if someone used client SDK with admin auth). |

**Deploy reminder:** Rules must be deployed (`firebase deploy --only firestore:rules`) to apply in production.

**Step 3 verdict:** **PASS** (aligned with “no public writes” goal)

---

## Step 4 — Admin dashboard (frontend)

**Files:** `frontend/src/admin/contacts/*`, `frontend/src/payment/AdminPaymentsDashboard.jsx` (Contacts section), `frontend/src/services/api.js`.

| Check | Result |
|-------|--------|
| List API | `getAdminContactMessages` → `GET /api/admin/contact-messages` with query params. |
| Columns | Name (+ avatar), email (in name cell), message preview, status, date, actions (View / Archive). |
| Detail modal | `ContactDetailsModal.jsx` — full message, internal notes, **Reply by email** block. |
| Admin actions | PATCH for status/notes; **Send email reply** calls dedicated POST; Archive / Mark as Replied in footer. |
| Mock/static list | **No** — data from API responses. |

**Note:** There is no separate “Mark as read” button in the modal footer; status **`read`** can still be set via **PATCH** if you extend the UI. Table filters include “Read”.

**Step 4 verdict:** **PASS** (minor: explicit “Mark as read” UI optional)

---

## Step 5 — Admin backend APIs

**File:** `backend/src/routes/adminRoutes.js`

| Route | Middleware | Purpose |
|-------|------------|---------|
| `GET /contact-messages` | `requireAuth`, `requireAdmin` (router-level) | List + stats + cursor pagination |
| `PATCH /contact-messages/:id` | Same | `status`, `adminNotes`, `updatedAt` |
| `POST /contact-messages/:id/send-reply` | Same | SMTP reply + Firestore reply fields + `status: replied` |

**Step 5 verdict:** **PASS**

---

## Step 6 — SMTP configuration (.env)

**Implementation reads:** `backend/src/services/contactReplyEmail.js`

| Variable | Used |
|----------|------|
| `SMTP_HOST` | **Yes** |
| `SMTP_PORT` | **Yes** (default `587`) |
| `SMTP_SECURE` | **Yes** (`true` / `1` / port `465` → secure) |
| `SMTP_USER` | **Yes** (optional object — if empty, `auth` omitted; many hosts need user+pass) |
| `SMTP_PASS` | **Yes** |
| `CONTACT_REPLY_FROM_EMAIL` | **Yes** |
| `CONTACT_REPLY_FROM_NAME` | **Yes** (optional, default `Support`) |
| `CONTACT_REPLY_SUBJECT_PREFIX` | **Yes** (optional) |

**`isContactReplySmtpConfigured()`** only requires **`SMTP_HOST` + `CONTACT_REPLY_FROM_EMAIL`**. It does **not** require `SMTP_PASS` to be non-empty — so misconfiguration may surface as **502** at send time (e.g. auth failure) rather than at startup.

**Brevo:** Typically use your Brevo SMTP login (often your verified sender email) as `SMTP_USER` and the **SMTP key** as `SMTP_PASS`. This is **not** the same as SendGrid’s literal username `apikey`. Follow Brevo’s SMTP doc for your account.

**This audit does not read your private `.env`** — verify values locally.

**Step 6 verdict:** **PASS** (with **WARNING**: validate `SMTP_PASS` non-empty for Brevo in ops runbook)

---

## Step 7 — Email sending logic

**File:** `backend/src/services/contactReplyEmail.js`

| Check | Result |
|-------|--------|
| Nodemailer `createTransport` | **Yes** (lines 79–84). |
| `sendMail` | **Yes** (lines 86–92). |
| From / subject | Uses `CONTACT_REPLY_FROM_EMAIL`, `CONTACT_REPLY_FROM_NAME`, `CONTACT_REPLY_SUBJECT_PREFIX`. |
| Recipient | Inquiry `email` from Firestore doc (not hardcoded). |
| Errors | Try/catch; returns `{ ok: false, errorMessage }`; controller maps to **502** and can persist `replyEmailLastError`. |

**Checklist variance:** Some documents refer to `POST /api/admin/contact-reply`. **This codebase uses:**

`POST /api/admin/contact-messages/:id/send-reply`

Functionally equivalent; update runbooks/API clients if they assumed the other path.

**Step 7 verdict:** **PASS** (document path name)

---

## Step 8 — Admin UI email flow

**Files:** `ContactDetailsModal.jsx`, `AdminContactsPage.jsx`, `api.sendAdminContactReply`

| Check | Result |
|-------|--------|
| Reply UI | **Yes** — “Reply by email” textarea + **Send email reply** button. |
| API triggered | **Yes** — `api.sendAdminContactReply(id, { replyBody, adminNotes })`. |
| Success / failure | Toast via `onNotify` in parent; on failure, list refresh attempted to show `replyEmailLastError`. |

**Step 8 verdict:** **PASS**

---

## Step 9 — Full flow (critical)

| Step | Automated in audit? |
|------|---------------------|
| 1 Submit form | Code path verified; **you** confirm in browser + network tab. |
| 2 Firestore doc | **You** confirm in Firebase Console. |
| 3 Admin list | **You** confirm with admin account. |
| 4 View / reply | **You** confirm modal + send. |
| 5 Email received | **You** confirm inbox + spam folder. |

**Step 9 verdict:** **MANUAL VERIFICATION REQUIRED**

---

## Step 10 — Security & production

| Check | Result |
|-------|--------|
| SMTP secrets in frontend | **None** — grep `frontend/src` for `SMTP_` / `CONTACT_REPLY` / `nodemailer`: **no matches**. |
| Backend env | Uses `process.env` only on server. |
| Rate limit on `POST /api/contact` | **Yes** — `contactFormRateLimiter` in `contactRoutes.js` (**5 req/min/IP**, `ipKeyGenerator`). |
| Input handling | Trim + length limits server-side; reply HTML escaped in `contactReplyEmail.js`. |
| Admin send-reply rate limit | **Not** applied separately (optional hardening). |

**Step 10 verdict:** **PASS** with **WARNING**: consider rate limit on `send-reply` per admin/IP to reduce abuse if credentials are compromised.

---

## Final structured output (summary)

### ✅ WORKING

- Real contact submit: `ContactForm.jsx` → `api.submitContact` → `POST /api/contact` (no fake delay).
- Server validation + Admin SDK write to `contactMessages` with `status: 'new'`, timestamps, `userAgent`, `ipHash`.
- Firestore rules: client **cannot** create contact docs; deletes denied.
- Admin `GET` / `PATCH` / `POST send-reply` behind `requireAuth` + `requireAdmin`.
- Cursor pagination + stats on list endpoint.
- Nodemailer SMTP send with configurable from name/subject; HTML entity escape for reply body.
- Admin UI: list, modal, internal notes, email reply, archive / mark replied paths.
- Public contact POST rate limited.
- No SMTP env vars bundled into frontend bundle.

### ❌ BROKEN

- **None identified** in code review for the intended architecture, assuming:
  - Firestore rules deployed,
  - Firebase Admin credentials present on the server,
  - SMTP env complete and correct for Brevo.

### ⚠️ IMPROVEMENTS (non-critical)

- Align external docs with actual route: **`POST /api/admin/contact-messages/:id/send-reply`** (not `.../contact-reply`).
- Optional client-side message max length (5000) to match server.
- Stricter client email validation to match server regex.
- Explicit **“Mark as read”** UI if product requires `read` without email.
- **`isContactReplySmtpConfigured`**: optionally require non-empty `SMTP_PASS` when `SMTP_USER` is set.
- Rate limit **`send-reply`** in production.

### 🚨 CRITICAL FIXES BEFORE PRODUCTION

1. **Environment:** Set all required SMTP variables on the **host running Express**; confirm Brevo SMTP auth (user = often full email, password = SMTP key).
2. **Deploy Firestore rules** so `contactMessages` protections are live.
3. **Trust proxy** (if behind reverse proxy): ensure Express `trust proxy` is correct so `ipHash` / rate limits use real client IP (separate server config audit).
4. **Deliverability:** SPF/DKIM/DMARC for `CONTACT_REPLY_FROM_EMAIL` domain.
5. **Manual E2E** Step 9 after every env / deploy change.

---

## Related documentation

- `docs/CONTACT_PAGE_AND_ADMIN_INTEGRATION.md` — architecture + §7 email reply ops.
- `backend/.env.example` — SMTP variable template.

---

*End of audit document.*
