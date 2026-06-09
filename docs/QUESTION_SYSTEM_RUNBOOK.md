## Sequence IQ CSV/XLSX Upload Notes

Use admin question bank upload with these minimum columns:

`category,difficulty,type,question,option1,option2,option3,option4,correctIndex`

For Sequence IQ, set:
- `gameType=enigma_pulse`
- `type=riddle_sequence`

Optional metadata columns:
- `sequence` (pipe or comma delimited)
- `patternKind`
- `hint`
- `explanation`
- `tags`

### Common validation failures

- `Invalid EnigmaPulse type`: `type` is not one of supported values.
- `Syllogism category is reserved for syllogism type`: category/type mismatch.
- `Options must be unique`: duplicate options.
- `correctIndex 0–3 required`: invalid answer index.
- `Sequence must include at least 3 nodes when provided`: malformed sequence metadata.

### Runtime insufficiency behavior

If the question pool is too small for requested category/difficulty/type:
- backend retries with anti-repeat reset policy,
- if still insufficient, room creation fails with a controlled error (`Not enough questions available`),
- lobby remains usable for retry with different filters.
# Question System Runbook (Trivia + EnigmaPulse)

This runbook is for restoring and validating question delivery end-to-end.

## 1) Prerequisites

- Firebase CLI authenticated to the correct project.
- Backend service account configured with one of:
  - `FIREBASE_SERVICE_ACCOUNT_PATH`
  - `GOOGLE_APPLICATION_CREDENTIALS`
- Monorepo dependencies installed.

## 2) Local Startup

From monorepo root:

```bash
npm run dev
```

Alternative split terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Expected backend startup logs:

- `Firestore Admin OK`
- `Listening on http://0.0.0.0:3000`

## 3) Generate Question CSV

From `backend/`:

```bash
npm run questions:csv
```

Output:

- `backend/scripts/questions/generated_question_bank.csv`

## 4) Repair + Seed Firestore Questions

From `backend/`:

```bash
npm run questions:repair-seed
```

Optional modes:

```bash
node scripts/questions/fixAndSeedQuestions.js --write-csv-only
node scripts/questions/fixAndSeedQuestions.js --keep-invalid
```

What this does:

- Normalizes `gameType`, `category`, `difficulty`.
- Backfills `active`, `createdAt`, and options shape.
- Removes invalid documents (unless `--keep-invalid`).
- Seeds minimum baseline coverage for both game modes.

## 5) Deploy Firestore Indexes

From `backend/`:

```bash
firebase deploy --only firestore:indexes
```

## 6) Smoke Validation Commands

### Backend port test (PowerShell)

```powershell
$r=Test-NetConnection -ComputerName 127.0.0.1 -Port 3000; "TcpTestSucceeded=$($r.TcpTestSucceeded)"
```

### Firestore inventory audit (PowerShell)

```powershell
$env:DOTENV_CONFIG_PATH='../.env'; node -r dotenv/config --input-type=module -e "import { getAdminFirestore } from './src/services/firebaseAdmin.js'; const db=getAdminFirestore(); const snap=await db.collection('questions').get(); console.log('TOTAL='+snap.size);"
```

### Matrix game question smoke test (PowerShell)

```powershell

$env:DOTENV_CONFIG_PATH='../.env'; node -r dotenv/config --input-type=module -e "import { fetchQuestionsFromFirestore } from './src/services/firestoreQuestionBank.js'; import { buildEnigmaMatchQuestionDecks } from './src/services/enigmaPulse/enigmaQuestionSelection.js'; const triviaCats=['history','current_affairs']; const enigmaCats=['General Knowledge','Science','History','Sports']; const diffs=['easy','medium','hard']; let failures=0; for(const c of triviaCats){ for(const d of diffs){ const rows=await fetchQuestionsFromFirestore({uid:'matrix_'+c+'_'+d,category:c,difficulty:d,count:10}); if(rows.length<10) failures++; }} for(const c of enigmaCats){ for(const d of diffs){ const built=await buildEnigmaMatchQuestionDecks({uidA:'matrix_a_'+c+'_'+d,uidB:'matrix_b_'+c+'_'+d,isBotB:false,category:c,difficulty:d,count:12}); if((built.questionTarget||0)<1) failures++; }} console.log('FAILURES='+failures); if(failures>0) process.exit(1);"
```

## 7) Incident Recovery Sequence

When players report `No questions available` or `Not enough questions available`:

1. Confirm backend process is live on port `3000`.
2. Confirm Firestore Admin credential path is valid.
3. Re-run `questions:repair-seed`.
4. Deploy indexes (`firebase deploy --only firestore:indexes`).
5. Run matrix smoke test.
6. Restart backend.

## 8) Data Contract (Must Hold)

Each playable question document must have:

- `gameType`:
  - Trivia bank: `trivia`
  - Enigma bank: `enigma_pulse`
- `category`:
  - Trivia: `history` or `current_affairs`
  - Enigma: `General Knowledge`, `Science`, `History`, `Sports`
- `difficulty`: `easy`, `medium`, or `hard`
- `question` (or normalized from `text`)
- `options` as exactly 4 non-empty choices
- `correctIndex` integer `0..3`
- `active` boolean (missing treated as true in runtime fallback)
- `createdAt` timestamp

## 9) Syllogism Upload Contract (AI-Generator Ready)

Use this when generating bulk questions from ChatGPT or other tools.

### 9.1 Required CSV header

```text
gameType,category,difficulty,type,question,option1,option2,option3,option4,correctIndex,tags,active
```

### 9.2 Required values for Syllogism rows

- `gameType`: `enigma_pulse`
- `category`: `Syllogism`
- `type`: `syllogism`
- `difficulty`: `easy` | `medium` | `hard`
- `correctIndex`: integer `0..3`
- `active`: `true` or `false`
- `question`: max 500 chars
- options: exactly 4 non-empty unique values

### 9.3 Valid Syllogism row example

```text
enigma_pulse,Syllogism,easy,syllogism,"If all artists are creative and some teachers are artists, what follows?","Some teachers are creative.","All teachers are creative.","No teachers are creative.","Artists are not teachers.",0,"logic,reasoning,syllogism",true
```

### 9.4 Invalid cross-game examples

- Invalid (wrong category for syllogism type):
  - `enigma_pulse,Science,easy,syllogism,...`
- Invalid (syllogism category with non-syllogism type):
  - `enigma_pulse,Syllogism,easy,riddle_classic,...`

### 9.5 JSON object format (bulk-json endpoint)

```json
{
  "gameType": "enigma_pulse",
  "category": "Syllogism",
  "difficulty": "medium",
  "type": "syllogism",
  "question": "If no poets are engineers and some writers are poets, what must be true?",
  "option1": "Some writers are not engineers.",
  "option2": "All writers are engineers.",
  "option3": "No writers are poets.",
  "option4": "Some engineers are writers.",
  "correctIndex": 0,
  "tags": "logic,reasoning,syllogism",
  "active": true
}
```
