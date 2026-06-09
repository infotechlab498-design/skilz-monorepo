









/**
 * Audit Firestore `questions` for Sequence IQ / Pattern Recognition eligibility.
 *
 * Uses the same shape as {@link docToRow} + {@link isValidMcqRow} + {@link rowMatchesEnigmaGameKey}
 * in `enigmaQuestionSelection.js` (server deck build path).
 *
 * Usage (from repo root or backend/):
 *   node backend/scripts/enigmaPulse/auditSequenceIqQuestions.mjs
 *
 * Requires Admin SDK (same as API): `FIREBASE_SERVICE_ACCOUNT_PATH` or `GOOGLE_APPLICATION_CREDENTIALS`.
 */













import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAdminFirestore } from '../../src/services/firebaseAdmin.js';
import { rowMatchesEnigmaGameKey } from '../../src/services/enigmaPulse/enigmaQuestionSelection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '../..');
dotenv.config({ path: path.join(backendRoot, '..', '.env') });
dotenv.config({ path: path.join(backendRoot, '.env') });

function isDocActiveForPlay(d) {
  if (d.active === false) return false;
  if (String(d.active).toLowerCase() === 'false') return false;
  return true;
}

function optionsFromDocData(d) {
  if (Array.isArray(d.options) && d.options.length) {
    return d.options.map((x) => String(x ?? '').trim());
  }
  return [d.option1, d.option2, d.option3, d.option4].map((x) => String(x ?? '').trim());
}

function docToRow(id, d) {
  const options = optionsFromDocData(d);
  const correctIndex = Number(d.correctIndex);
  const sequence = Array.isArray(d.sequence) ? d.sequence.map((x) => String(x ?? '')) : [];
  return {
    id,
    category: String(d.category || ''),
    difficulty: String(d.difficulty || 'easy'),
    text: String(d.question ?? d.text ?? '').trim(),
    options,
    correctIndex,
    imageUrl: String(d.imageUrl || ''),
    acceptedAnswers: Array.isArray(d.acceptedAnswers)
      ? d.acceptedAnswers.map((x) => String(x).trim()).filter(Boolean)
      : [],
    normalizedAnswer: typeof d.normalizedAnswer === 'string' ? String(d.normalizedAnswer).trim() : '',
    type: String(d.type || d.questionType || '').trim().toLowerCase(),
    enigmaDeck: String(d.enigmaDeck ?? d.enigma_deck ?? '').trim(),
    hint: String(d.hint || '').trim(),
    explanation: String(d.explanation || '').trim(),
    patternKind: String(d.patternKind || d.pattern_kind || '').trim().toLowerCase(),
    ...(sequence.length ? { sequence } : {}),
  };
}

function isValidMcqRow(row) {
  const text = String(row.text ?? row.question ?? '').trim();
  if (!text) return false;
  if (!Array.isArray(row.options) || row.options.length !== 4) return false;
  if (!row.options.every((o) => String(o ?? '').trim())) return false;
  const parsedCorrectIndex = Number(row.correctIndex);
  if (!Number.isInteger(parsedCorrectIndex) || parsedCorrectIndex < 0 || parsedCorrectIndex > 3) {
    return false;
  }
  return true;
}

async function main() {
  const db = getAdminFirestore();
  if (!db) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason:
            'Firestore Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS.',
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const types = ['riddle_sequence', 'sequence', 'pattern_recognition'];
  let snap;
  try {
    snap = await db
      .collection('questions')
      .where('gameType', '==', 'enigma_pulse')
      .where('type', 'in', types)
      .limit(3000)
      .get();
  } catch (e) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: 'Query failed (missing index or permission)',
          detail: String(e?.message || e),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  let byType = { riddle_sequence: 0, sequence: 0, pattern_recognition: 0 };
  let activeDocs = 0;
  let serverPlayable = 0;
  let withSequenceLen3Plus = 0;
  const issues = { invalidMcq: 0, rowKeyMismatch: 0, inactive: 0 };

  for (const doc of snap.docs) {
    const d = doc.data() || {};
    const t = String(d.type || d.questionType || '').trim().toLowerCase();
    if (byType[t] != null) byType[t] += 1;

    if (!isDocActiveForPlay(d)) {
      issues.inactive += 1;
      continue;
    }
    activeDocs += 1;

    const row = docToRow(doc.id, d);
    if (!isValidMcqRow(row)) {
      issues.invalidMcq += 1;
      continue;
    }
    if (!rowMatchesEnigmaGameKey(row, 'pattern_recognition')) {
      issues.rowKeyMismatch += 1;
      continue;
    }
    serverPlayable += 1;
    if (Array.isArray(row.sequence) && row.sequence.length >= 3) {
      withSequenceLen3Plus += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        query: 'gameType==enigma_pulse AND type IN (riddle_sequence, sequence, pattern_recognition)',
        docsReturned: snap.size,
        byFirestoreType: byType,
        activeExplicitOrDefault: activeDocs,

        /** Same gates as fetch path after docToRow (MCQ + rowMatches for pattern_recognition). */

        serverEligibleSequenceIq: serverPlayable,

        /** UX-strong: non-empty sequence array with ≥3 nodes (admin CSV guidance). Not required by server. */

        withSequenceArrayLenGte3: withSequenceLen3Plus,
        skippedInactive: issues.inactive,
        skippedInvalidMcq: issues.invalidMcq,
        skippedRowKeyMismatch: issues.rowKeyMismatch,
        note: 'Semantic correctness (options match pattern) is not validated here. Broad-scan / other gameTypes are not included.',
      },
      null,
      2
    )
  );
}

await main();
