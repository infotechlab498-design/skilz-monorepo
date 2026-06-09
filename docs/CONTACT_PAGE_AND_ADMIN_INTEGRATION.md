# Contact Page — Technical Analysis & Admin Integration Guide

This document describes what the public **Contact Us** page does today, whether it talks to your backend or Firebase, gaps and risks, and everything you would add to surface submissions in the **Admin Dashboard** with data stored in **Firestore**.

---

## 1. File map (`frontend/src/contact/`)

| File | Role |
|------|------|
| [`Contact.jsx`](../frontend/src/contact/Contact.jsx) | Page shell: wraps content in shared [`Layout`](../frontend/src/Components/Layout.jsx), renders hero + form. No state, no API. |
| [`ContactHero.jsx`](../frontend/src/contact/ContactHero.jsx) | Marketing block: breadcrumb from URL, headline, description, hero image, static “Follow Us” placeholders, hardcoded phone, placeholder address text. |
| [`ContactForm.jsx`](../frontend/src/contact/ContactForm.jsx) | Controlled form: `firstName`, `lastName`, `email`, `message`. Client-side validation and submit handler. |
| [`styles/contactUs.css`](../frontend/src/contact/styles/contactUs.css) | Presentation only. |

Routing: [`App.jsx`](../frontend/src/App.jsx) exposes `<Route path="/contact" element={<Contact />} />`. Header/Footer link to `/contact`.

---

## 2. What happens when the user submits the form?

**Today: nothing is sent to your server or Firebase.**

In [`ContactForm.jsx`](../frontend/src/contact/ContactForm.jsx), `handleSubmit`:

1. Runs `validate()` (required fields + simple email regex).
2. Sets `loading` to `true`.
3. **`await new Promise((resolve) => setTimeout(resolve, 1200));`** — a fixed 1.2s delay that **simulates** a network call.
4. Sets `success` to `true`, clears the form, and sets `loading` to `false`.

There is **no** `fetch`, **no** `api.*`, **no** Firebase client write, and **no** email service call. The success message (“Your message has been sent successfully!”) is **misleading** from a systems perspective: the UI behaves as if delivery succeeded, but **no message was stored or delivered**.

---

## 3. Is it connected to the backend?

**No.** A search of `backend/src` shows no contact/inquiry API routes tied to this form. The word “contact” appears only in generic user-facing error strings (e.g. “contact support”), not as a contact-form endpoint.

So:

| Concern | Status |
|---------|--------|
| Persist submissions in Firestore | Not implemented |
| POST to Express API | Not implemented |
| Email to support (SendGrid, etc.) | Not implemented |
| Admin list of inquiries | Not implemented |

---

## 4. Critical observations (UX / product / code quality)

1. **False success** — Users believe the message was sent; operations have no record. Risk for support and trust.
2. **No failure path** — `catch` only logs; no user-visible error if you later add a real API.
3. **Static / placeholder content in hero** — Social icons are literal characters in `<span>`; address line is lorem-style placeholder; phone is hardcoded. Fine for a mockup, not for production brand consistency.
4. **Typo** — `ContactHero` uses class `contact-titl` (likely truncated). CSS may or may not target it correctly.
5. **Accessibility** — Success banner uses emoji; decorative choices may not match rest of site tone.

---

## 5. What remains to create (end-to-end “real” contact flow)

To make the contact page production-ready **and** visible in the admin dashboard:

### 5.1 Firestore data model (recommended collection: `contactMessages` or `contactInquiries`)

Each document = one submission. Suggested fields:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Firestore document ID (return in API as `id`). |
| `firstName` | string | From form. |
| `lastName` | string | From form. |
| `email` | string | From form (normalized lowercase for lookups). |
| `message` | string | Body (max length enforced server-side). |
| `subject` | string (optional) | If you add a subject field later. |
| `status` | string | e.g. `"new"`, `"read"`, `"replied"`, `"archived"` — for admin workflow. |
| `source` | string | e.g. `"web_contact"` — if you add other channels later. |
| `userAgent` | string (optional) | From request headers (spam/debug). |
| `ipHash` | string (optional) | Privacy-friendly rate limit / abuse signal (hash, don’t store raw IP if policy requires). |
| `createdAt` | timestamp | Server time on create. |
| `updatedAt` | timestamp | When admin changes status / notes. |
| `adminNotes` | string (optional) | Internal notes. |
| `repliedAt` | timestamp (optional) | When marked replied. |

**Indexes:** If you query `where('status','==','new').orderBy('createdAt','desc')`, add a composite index in `firestore.indexes.json`.

### 5.2 Firestore security rules

- **Recommended:** **No** direct client writes to `contactMessages` from anonymous browsers (avoids open spam into your DB).
- **Pattern:** Public site → `POST /api/contact` (no auth or light rate limit) → Express uses **Firebase Admin SDK** to `add()` the document.
- Rules can be `allow read, write: if false` for clients, or `allow create: if false` and all access via Admin SDK only.

### 5.3 Express API

| Method | Path | Auth | Behavior |
|--------|------|------|------------|
| `POST` | `/api/contact` | Public (rate-limited) | Validate body, optional honeypot, write one Firestore doc, optional email to support. |
| `GET` | `/api/admin/contact-messages` | `requireAuth` + `requireAdmin` | List with pagination + `?status=` filter, sort `createdAt` desc. |
| `PATCH` | `/api/admin/contact-messages/:id` | Admin | Update `status`, `adminNotes`. |

Reuse the same auth pattern as [`adminRoutes.js`](../backend/src/routes/adminRoutes.js) (`requireAuth`, `requireAdmin`).

### 5.4 Frontend — public contact form

- Replace the fake `setTimeout` with `fetch(`${API_BASE}/contact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(...) })`.
- Map non-OK responses to visible errors; keep loading states.
- Optional: honeypot field (hidden) to reduce bots.

### 5.5 Frontend — Admin Dashboard

Mirror patterns used for payments/newsletter/blogs:

- New section in [`AdminPaymentsDashboard.jsx`](../frontend/src/payment/AdminPaymentsDashboard.jsx) (e.g. `section === 'contacts'`) **or** a dedicated route if you prefer.
- Table columns aligned with Firestore fields, for example:
  - **Received** (`createdAt`)
  - **Name** (`firstName` + `lastName`)
  - **Email** (`email`)
  - **Preview** (first ~120 chars of `message`)
  - **Status** (`status` badge)
  - **Actions** — View full message modal, Mark as read, Archive, optional “Copy email”
- **Detail drawer/modal** — full `message`, metadata, `adminNotes` textarea, save.
- **API client** — add methods in [`api.js`](../frontend/src/services/api.js): `submitContact`, `getAdminContactMessages`, `patchAdminContactMessage`.

### 5.6 Optional: email notification

On `POST /api/contact`, after Firestore write, enqueue or send email (e.g. existing mail stack if you add one) to your support inbox with submission summary. Keeps Firestore as source of truth; email is a notifier.

### 5.7 Abuse and compliance

- **Rate limiting** on `POST /api/contact` (per IP / per email).
- **Max length** on `message` (e.g. 5000 chars).
- **Privacy:** document in privacy policy that inquiries are stored; retention policy if required.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| What does the contact page do? | Renders hero + form; validates locally; **fakes** submit with a timeout; shows success; **does not** persist or send data. |
| Connected to backend? | **No.** |
| Connected to Firebase? | **No** (no client SDK usage for contact on this page). |
| To store in Firebase + show in admin | Firestore collection + Express `POST` + admin `GET`/`PATCH` + dashboard UI + `api.js` methods + rules/indexes as above. |

This is the full checklist to evolve the current UI-only form into a **logged, admin-visible** contact system.

---

## 7. Admin email replies (implemented)

Admins open **Message Details** on a row → write **Reply by email** → **Send email reply**. The visitor receives the message at the email address they entered on the contact form.

| Piece | Location |
|--------|-----------|
| Public submit | `POST /api/contact` → Firestore `contactMessages` |
| Send reply | `POST /api/admin/contact-messages/:id/send-reply` body `{ replyBody, adminNotes? }` |
| SMTP sender | `backend/src/services/contactReplyEmail.js` (nodemailer) |
| Env template | `backend/.env.example` (`SMTP_*`, `CONTACT_REPLY_FROM_EMAIL`, …) |
| UI | `frontend/src/admin/contacts/ContactDetailsModal.jsx`, `api.sendAdminContactReply` |

Firestore fields updated on successful send: `replyBody`, `replySentAt`, `status: replied`, cleared `replyEmailLastError`. On SMTP failure the API returns **502** and stores `replyEmailLastError` for admins.

### Firebase / GCP — what you enable

1. **Nothing extra inside Firebase Console** turns on outbound email for this flow — Firebase does not send SMTP mail for Express-hosted APIs by itself.
2. **Firestore:** Ensure deployed **`firestore.rules`** include `contactMessages` as implemented (no client writes). Indexes unchanged for replies (same docs).
3. **Firestore indexes:** No new composite index is required solely for `replySentAt` (admin queries remain ordered by `createdAt`).
4. **Hosting:** Outbound SMTP depends on **your backend hosting provider** allowing egress on ports **587** (STARTTLS) or **465** (TLS). Some networks block SMTP; if blocked use your ESP’s HTTP API instead (would require a different integration than nodemailer SMTP).
5. **Secrets:** Put SMTP credentials in **environment variables** (or GCP Secret Manager + mounted env). Never expose SMTP creds to the frontend.
6. **Optional Firebase Extension (“Trigger Email”)** — Not wired here; this codebase uses Express + nodemailer instead.

### Operational checklist

- Choose SMTP (workspace Gmail app password, SendGrid SMTP, Mailgun SMTP, Amazon SES SMTP, etc.).
- Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `CONTACT_REPLY_FROM_EMAIL`, and optionally `CONTACT_REPLY_FROM_NAME`, `CONTACT_REPLY_SUBJECT_PREFIX`.
- Restart backend after changing `.env`.
- Verify DKIM/SPF with your domain so replies avoid spam folders.
