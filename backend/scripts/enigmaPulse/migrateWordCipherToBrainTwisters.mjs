/**
 * Migrate EnigmaPulse Word Cipher questions to category `brain_twisters`.
 *
 * Usage (from repo root):
 *   node backend/scripts/enigmaPulse/migrateWordCipherToBrainTwisters.mjs          # dry-run
 *   node backend/scripts/enigmaPulse/migrateWordCipherToBrainTwisters.mjs --apply # write updates
 *
 * Requires Firebase Admin SDK env (same as backend API).
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../../src/services/firebaseAdmin.js';
import { WORD_CIPHER_CATEGORY } from '../../../shared/enigmaPulse/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '../..');
dotenv.config({ path: path.join(backendRoot, '..', '.env') });
dotenv.config({ path: path.join(backendRoot, '.env') });

const COLLECTION = 'questions';
const WORD_CIPHER_TYPES = new Set(['word_cipher', 'cipher']);
const apply = process.argv.includes('--apply');

function isWordCipherDoc(data) {
  const t = String(data.type || data.questionType || '').trim().toLowerCase().replace(/\s+/g, '_');
  return WORD_CIPHER_TYPES.has(t);
}

async function main() {
  const db = getAdminFirestore();
  if (!db) {
    console.error('Firestore Admin is not configured.');
    process.exit(1);
  }

  const snap = await db.collection(COLLECTION).where('gameType', '==', 'enigma_pulse').get();
  /** @type {{ id: string; from: string; to: string }[]} */
  const pending = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (!isWordCipherDoc(data)) continue;
    const current = String(data.category || '').trim();
    if (current === WORD_CIPHER_CATEGORY) continue;
    pending.push({ id: doc.id, from: current || '(empty)', to: WORD_CIPHER_CATEGORY });
  }

  console.log(`[WordCipher] ${pending.length} document(s) need category → ${WORD_CIPHER_CATEGORY}`);
  for (const row of pending.slice(0, 20)) {
    console.log(`  - ${row.id}: ${row.from} → ${row.to}`);
  }
  if (pending.length > 20) {
    console.log(`  … and ${pending.length - 20} more`);
  }

  if (!pending.length) {
    console.log('[WordCipher] Nothing to migrate.');
    return;
  }

  if (!apply) {
    console.log('[WordCipher] Dry run only. Re-run with --apply to update Firestore.');
    return;
  }

  let updated = 0;
  for (let i = 0; i < pending.length; i += 400) {
    const batch = db.batch();
    for (const row of pending.slice(i, i + 400)) {
      batch.update(db.collection(COLLECTION).doc(row.id), {
        category: WORD_CIPHER_CATEGORY,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    updated += Math.min(400, pending.length - i);
  }

  console.log(`[WordCipher] Updated ${updated} document(s) to category ${WORD_CIPHER_CATEGORY}.`);
}

main().catch((err) => {
  console.error('[WordCipher] migration failed:', err?.message || err);
  process.exit(1);
});
