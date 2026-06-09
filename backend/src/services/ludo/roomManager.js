/**
 * Ludo room persistence — Firestore only (replaces ludo_room_snapshots.json).
 */

import {
  loadActiveLudoMatchesIntoMap,
  getFirestoreOrNull,
  readLudoMatch,
  writeLudoMatch,
  deleteLudoMatchDoc,
} from './firestoreLudoStore.js';
import { incMetric } from './infrastructure/observability/ludoMetrics.js';

/**
 * Restore LOBBY/PLAYING matches from Firestore (server boot).
 * @param {Map<string, object>} roomStates
 */
export async function loadLudoSnapshotsInto(roomStates) {
  const adb = getFirestoreOrNull();
  if (!adb) {
    console.warn('[Ludo] Firestore Admin unavailable — no rooms restored from disk.');
    return;
  }
  await loadActiveLudoMatchesIntoMap(adb, roomStates);
}

/**
 * Persist current in-memory row to Firestore (write-through).
 * @param {string} roomId
 * @param {object} state
 */
export async function saveLudoRoomSnapshot(roomId, state) {
  const adb = getFirestoreOrNull();
  if (!adb || !state) return;
  try {
    // #region agent log
    fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H6',location:'backend/src/services/ludo/roomManager.js:saveLudoRoomSnapshot:beforeWrite',message:'Persist snapshot attempt',data:{roomId:String(roomId||''),stateRevision:Number(state.revision||0),currentTurn:String(state.currentTurn||''),currentPlayerIndex:Number(state.currentPlayerIndex||0)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    const merged = await writeLudoMatch(adb, roomId, state);
    state.revision = merged.revision;
    // #region agent log
    fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H6',location:'backend/src/services/ludo/roomManager.js:saveLudoRoomSnapshot:writeOk',message:'Persist snapshot success',data:{roomId:String(roomId||''),mergedRevision:Number(merged.revision||0),currentTurn:String(state.currentTurn||'')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
  } catch (e) {
    if (e?.code === 'STALE_SNAPSHOT_WRITE') {
      incMetric('staleSnapshotWriteRejected');
      try {
        const latest = await readLudoMatch(adb, roomId);
        if (latest && Number(latest.revision || 0) > Number(state.revision || 0)) {
          // #region agent log
          fetch('http://127.0.0.1:7476/ingest/7c42d0e9-cf3a-477d-9d8b-032edb23d1b1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ca77f1'},body:JSON.stringify({sessionId:'ca77f1',runId:'run-turn-latency',hypothesisId:'H6',location:'backend/src/services/ludo/roomManager.js:saveLudoRoomSnapshot:staleRecovery',message:'Applied stale snapshot recovery from Firestore',data:{roomId:String(roomId||''),stateRevision:Number(state.revision||0),latestRevision:Number(latest.revision||0),stateTurn:String(state.currentTurn||''),latestTurn:String(latest.currentTurn||'')},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          const sockets = state.sockets || {};
          for (const key of Object.keys(state)) delete state[key];
          Object.assign(state, latest, { sockets });
          return;
        }
      } catch (readErr) {
        console.error(
          '[Ludo] Firestore stale snapshot recovery failed:',
          roomId,
          readErr?.message || readErr
        );
      }
    }
    console.error('[Ludo] Firestore persist failed:', roomId, e?.message || e);
  }
}

/**
 * Remove match document (host closed lobby, etc.).
 * @param {string} roomId
 */
export async function deleteLudoRoomFirestore(roomId) {
  const adb = getFirestoreOrNull();
  if (!adb) return;
  try {
    await deleteLudoMatchDoc(adb, roomId);
  } catch (e) {
    console.error('[Ludo] Firestore delete failed:', roomId, e?.message || e);
  }
}
