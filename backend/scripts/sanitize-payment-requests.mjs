/**
 * One-time / optional: merge missing safe defaults onto `paymentRequests` documents.
 * Does not touch other collections.
 *
 * Run from `backend/`:
 *   node scripts/sanitize-payment-requests.mjs
 *
 * By default performs a dry run (logs only). Set DRY_RUN=0 to write.
 * We set `createdAt` only when the field is missing, using serverTimestamp().
 */

import 'dotenv/config';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../src/services/firebaseAdmin.js';

const DRY_RUN = process.env.DRY_RUN !== '0';

async function main() {
  const db = getAdminFirestore();
  if (!db) {
    console.error('Firestore Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }

  const col = db.collection('paymentRequests');
  const pageSize = 300;
  let lastDoc = null;
  let updated = 0;
  let scanned = 0;

  for (;;) {
    let q = col.orderBy(FieldPath.documentId()).limit(pageSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned += 1;
      const d = doc.data() || {};
      const patch = {};
      if (d.status === undefined || d.status === null || String(d.status).trim() === '') {
        patch.status = 'pending';
      }
      if (d.paymentMethod === undefined || d.paymentMethod === null || String(d.paymentMethod).trim() === '') {
        patch.paymentMethod = 'unknown';
      }
      const hasAmount =
        d.amount !== undefined && d.amount !== null && Number.isFinite(Number(d.amount));
      const hasCoins =
        d.coinsRequested !== undefined &&
        d.coinsRequested !== null &&
        Number.isFinite(Number(d.coinsRequested));
      if (!hasAmount && !hasCoins) {
        patch.amount = 0;
        patch.coinsRequested = 0;
      }
      if (d.createdAt === undefined || d.createdAt === null) {
        patch.createdAt = FieldValue.serverTimestamp();
      }

      if (Object.keys(patch).length === 0) continue;

      if (DRY_RUN) {
        console.log('[dry-run] would patch', doc.id, patch);
      } else {
        await doc.ref.set(patch, { merge: true });
        updated += 1;
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  console.log(
    DRY_RUN
      ? `Dry run complete. Scanned ${scanned} documents. Set DRY_RUN=0 to apply merges.`
      : `Done. Scanned ${scanned}, updated ${updated} documents.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
