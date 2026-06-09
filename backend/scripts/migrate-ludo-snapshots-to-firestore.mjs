/**
 * One-time migration: backend/src/data/ludo_room_snapshots.json → Firestore `ludoMatches/{roomId}`.
 *
 * Run from the `backend/` directory (loads .env via dotenv):
 *   node scripts/migrate-ludo-snapshots-to-firestore.mjs
 *
 * Skips documents that already exist. Does not delete the JSON file (archive manually).
 */

import 'dotenv/config';
import fs from 'fs';
import { LUDO_ROOM_SNAPSHOTS_FILE } from '../src/config/paths.js';
import { getAdminFirestore } from '../src/services/firebaseAdmin.js';
import {
  LUDO_MATCHES_COLLECTION,
  writeLudoMatch,
} from '../src/services/ludo/firestoreLudoStore.js';

async function main() {
  const adb = getAdminFirestore();
  if (!adb) {
    console.error('Firestore Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }

  if (!fs.existsSync(LUDO_ROOM_SNAPSHOTS_FILE)) {
    console.log('No snapshot file at', LUDO_ROOM_SNAPSHOTS_FILE, '— nothing to migrate.');
    process.exit(0);
  }

  const raw = fs.readFileSync(LUDO_ROOM_SNAPSHOTS_FILE, 'utf8');
  let list = [];
  try {
    list = JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Invalid JSON:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(list)) {
    console.error('Snapshot file must contain a JSON array.');
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;
  for (const row of list) {
    const roomId = row?.roomId;
    const state = row?.state;
    if (!roomId || !state) continue;

    const ref = adb.collection(LUDO_MATCHES_COLLECTION).doc(roomId);
    const ex = await ref.get();
    if (ex.exists) {
      skipped++;
      continue;
    }

    await writeLudoMatch(adb, roomId, state);
    migrated++;
    console.log('Migrated', roomId, state.status);
  }

  console.log('Done. Migrated:', migrated, 'Skipped (already in Firestore):', skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
