# Admin Dashboard & Payment Verification System

## Overview

This document explains the current implementation status of the Coin Purchase + Admin Verification system, what is already linked end-to-end, and what still remains before calling it fully production-hardened.

Core principle implemented: **coins are credited only after admin approval on the backend**.

---

## Implemented Features

### 1) User Payment Request Flow (Frontend + Backend)

Implemented flow:

1. User opens checkout page (`/checkout`)
2. Selects payment method (`jazzcash`, `easypaisa`, `bank`)
3. Sees dynamic transfer details (receiver name/account/bank info)
4. Uploads screenshot (jpg/png/webp, max 2MB)
5. Clicks Pay Now
6. Frontend:
   - Generates `orderId`
   - Uploads screenshot to backend endpoint
   - Receives Cloudinary `secure_url`
   - Submits payment request to backend
7. Backend creates Firestore `paymentRequests` document with `status: "pending"`

Frontend files:

- `frontend/src/payment/CheckoutForm.jsx`
- `frontend/src/payment/CheckoutPage.jsx`
- `frontend/src/payment/checkout.css`
- `frontend/src/services/api.js`

Backend files:

- `backend/src/routes/paymentRoutes.js`
- `backend/src/controllers/paymentController.js`
- `backend/src/services/cloudinaryService.js`

---

### 2) Screenshot Upload + Cloudinary

Implemented:

- Upload accepts images only (`jpeg/png/webp`)
- Max size 2MB (multer + validation middleware)
- Screenshot is uploaded to Cloudinary
- Only URL is stored in Firestore payment request document

Relevant backend pieces:

- `backend/src/middleware/uploadMiddleware.js`
- `backend/src/services/cloudinaryService.js`
- `backend/src/controllers/paymentController.js`

---

### 3) Admin Dashboard (Frontend)

Implemented route:

- `/admin/payments`

Implemented UI sections:

- Users tab
  - list users (name/email/coins/role)
  - search by name/email
- Payment Requests tab
  - filter by status
  - view request details
  - screenshot modal preview
  - approve/reject actions

Files:

- `frontend/src/payment/AdminPaymentsDashboard.jsx`
- `frontend/src/payment/adminPayments.css`
- `frontend/src/App.jsx`

---

### 4) Admin Actions (Backend)

Implemented admin endpoints:

- `GET /api/admin/users`
- `GET /api/admin/payments`
- `POST /api/admin/approve`
- `POST /api/admin/reject`

Approval logic implemented server-side:

- validate admin access
- fetch payment request
- if already non-pending, return idempotent response (no double credit)
- transaction:
  - increment `users/{uid}.coins`
  - set request `status = approved`
  - set `approvedAt`, `approvedBy`

Reject logic:

- set request `status = rejected`
- set `rejectedAt`, `rejectedBy`

Files:

- `backend/src/routes/adminRoutes.js`
- `backend/src/controllers/adminController.js`
- `backend/src/middleware/adminMiddleware.js`

---

### 5) Authentication & Authorization

Implemented checks:

- Request auth: Firebase ID token via existing auth middleware
- Admin backend condition:
  - email must be `info@aljazeeragc.com`
  - Firestore `users/{uid}.role` must be `"admin"`

Frontend behavior:

- Admin route page is intended for admin login only
- Header and sidebar were updated to show/admin-route dashboard navigation for admin email

Files:

- `backend/src/middleware/auth.js`
- `backend/src/middleware/authMiddleware.js`
- `backend/src/middleware/adminMiddleware.js`
- `frontend/src/Components/Header.jsx`
- `frontend/src/Components/sidebar/PlayerSidebar.jsx`
- `frontend/src/layout/PlayerDashboardLayout.jsx`

---

### 6) Firestore Rules

Updated rules:

- Added `isAdmin()` helper
- `paymentRequests` rules:
  - create: authenticated user with validation
  - read: owner or admin
  - update: admin only
  - delete: denied
- `users` read allows owner or admin
- coins remain server-authoritative (clients do not get direct coin mutation path)

Rules file:

- `backend/firebase/firestore.rules`

---

## Backend Linkage Map (Connected Parts)

### Connected End-to-End

- Checkout UI -> screenshot upload API -> Cloudinary URL -> create-request API -> Firestore `paymentRequests` pending
- Admin UI -> admin list APIs -> Firestore reads
- Admin approve/reject buttons -> admin APIs -> Firestore status updates
- Approve endpoint -> transaction -> user coin increment + payment status update

### Registered in Server

Mounted routes in:

- `backend/src/server.js`
  - `app.use('/api/payment', paymentRoutes)`
  - `app.use('/api/admin', adminRoutes)`

---

## Firestore Data Model (Current)

### `users/{uid}`

Expected relevant fields used by this flow:

- `uid`
- `email`
- `coins` (number)
- `role` (`user` or `admin`)
- optional display fields (`displayName`, `name`)

### `paymentRequests/{id}`

Current write/read fields:

- `id`
- `userId`
- `userName`
- `userEmail`
- `coinsRequested`
- `paymentMethod`
- `screenshotUrl`
- `orderId`
- `status` (`pending` | `approved` | `rejected`)
- `createdAt`
- `approvedAt`
- `rejectedAt`
- `approvedBy`
- `rejectedBy`

---

## What Is Still Remaining

These items are not blockers for basic flow, but are recommended for robust production readiness:

1. **Config hardening**
   - move admin email constant to env/config
   - avoid duplicated literals in frontend/backend

2. **Audit trail collection**
   - create dedicated `adminActions` collection for immutable admin action logs

3. **Pagination + scaling**
   - add pagination/cursors for users/payments lists (currently limited batch)

4. **Upload orphan cleanup**
   - add cleanup strategy if screenshot upload succeeds but request creation fails

5. **Automated tests**
   - add API tests for:
     - admin auth checks
     - order id uniqueness
     - idempotent approve behavior
     - reject flow

6. **Operational safeguards**
   - rate limiting for payment request creation endpoint
   - stricter observability/alerts for admin actions

7. **Firestore indexes**
   - if Firestore prompts index creation for queried combinations, add and deploy indexes

---

## Quick Verification Checklist

1. User can create pending payment request from checkout.
2. Payment request appears in `/admin/payments`.
3. Admin approve increments user coins exactly once.
4. Re-approve same request does not add extra coins.
5. Reject changes status without coin update.
6. Non-admin cannot access admin APIs.
7. Firestore rules deployed and active.

---

## Deployment Notes

Rules and backend routes must be deployed/running in the correct environment:

- Firestore rules source: `backend/firebase/firestore.rules`
- Local backend service mounts payment/admin routes through `backend/src/server.js`

Recommended command (from `backend` directory):

```bash
npx -y firebase-tools@latest deploy --only firestore:rules
```

