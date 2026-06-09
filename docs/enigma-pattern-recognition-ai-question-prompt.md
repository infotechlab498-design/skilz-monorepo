# EnigmaPulse Sequence IQ (Pattern Recognition) — AI Question Generation Prompt Pack

Use this document to generate **numeric pattern / sequence** questions for **Sequence IQ** (`PatternRecognition.jsx`), then import via **Admin → Trivia & EnigmaPulse question bank** (CSV/Excel bulk upload or single-row form).

---

## 1. What the game is (code truth)

| Layer | Value |
|-------|--------|
| Lobby tile | **Pattern Recognition** |
| Socket `gameKey` | `pattern_recognition` (legacy alias: `riddle_sequence`) |
| Route | `/enigmaPulse/sequence/:roomId` |
| Firestore `gameType` | **`enigma_pulse`** (required) |
| Firestore `type` | **`riddle_sequence`** (also accepted at runtime: `sequence`, `pattern_recognition`) |
| Engine | `RiddleEngine` — **MCQ only** (player taps option; server grades option text) |
| Match size | **20 shared nodes** (`SEQUENCE_IQ_SHARED_ROUNDS`); **10 nodes per human** (alternating turns) |
| Timer | **15 seconds** per node (`QUESTION_SECONDS`) |
| Question pool fetch | **Merges easy + medium + hard** for the lobby category (lobby difficulty does **not** narrow the Firestore query for Sequence IQ) |
| In-match difficulty curve | Nodes 1–5 → prefer `easy` rows; 6–10 → `medium`; 11–20 → `hard` (`syllogismDifficultyForIndex`) |

### UI rendering (`PatternRecognition.jsx`)

- If `question.sequence` is a **non-empty array**, the client shows a **single horizontal line** of cells separated by `|` (pipe).
- The missing value must be the literal string **`?`** (one `?` cell per question).
- If `sequence` is empty, the client falls back to **`question` text** only (no pipe line).
- Four answer tiles **A–D** map to `options[0..3]`; submission sends the **option string**, not the index.

**Important:** There is **no native 2D grid renderer** today. “Rows and columns” are modeled as **two question shapes** (see §4): **linear sequence** and **matrix row/column** (target line in `sequence`, full grid context in `hint`).

---

## 2. Lobby categories (required)

From `shared/enigmaPulse/categories.js` — use **exact** strings:

| `category` value |
|------------------|
| `General Knowledge` |
| `Science` |
| `History` |
| `Sports` |

---

## 3. Required & optional fields (admin + Firestore)

| Column / field | Required | Rules |
|----------------|----------|--------|
| `gameType` | Yes (bulk) | Must be **`enigma_pulse`** |
| `type` | Yes | Must be **`riddle_sequence`** for Sequence IQ |
| `category` | Yes | One of the four lobby categories above |
| `difficulty` | Yes | `easy`, `medium`, or `hard` — tags the row for the **in-match curve** (§6) |
| `question` | Yes | 1–500 characters; stem / instructions (see §4 display rules) |
| `option1` … `option4` | Yes | All non-empty; **unique** (case-insensitive); numeric strings for this mode |
| `correctIndex` | Yes | Integer **0–3** (0 = option1) |
| `sequence` | Strongly recommended | Pipe- or comma-delimited in CSV; **≥3 nodes** when provided; must include exactly one `?` |
| `patternKind` | Optional | Taxonomy for generators (§5); stored and sent to client |
| `tags` | Optional | Comma-separated, e.g. `sequence,arithmetic,easy` |
| `hint` | Optional | Shown after “Request Hint” — use for **matrix context** (§4B) |
| `explanation` | Optional | Admin review only (not shown in match UI today) |
| `active` | Optional | Default `true`; only `active=true` rows are selected |

### Bulk CSV header (copy exactly)

```csv
gameType,category,difficulty,type,question,option1,option2,option3,option4,correctIndex,sequence,patternKind,tags,hint,explanation
```

Example row (linear):

```csv
enigma_pulse,Science,medium,riddle_sequence,What number completes the sequence?,81,243,729,2187,1,3|9|27|81|?,geometric,sequence|powers|science,Each term is multiplied by 3.,3×27=81; next is 81×3=243.
```

---

## 4. Two supported question shapes (numbers)

### 4A — Linear sequence (primary; best UX)

**Use when:** the pattern is read left-to-right on one line.

| Property | Rule |
|----------|------|
| `sequence` | **4–8** visible nodes including **one** `?` (minimum **3** nodes if you must use fewer) |
| `question` | Short stem, e.g. `What number completes the sequence?` |
| `options` | Four **numeric** distractors; exactly one equals the missing cell |
| `patternKind` | `arithmetic`, `geometric`, `fibonacci`, `prime`, `alternating`, `multi_step`, or `exponential` |

**In-game display:** `3 | 9 | 27 | 81 | ?`

**Generator checks:**

- [ ] Exactly one `?` in `sequence`
- [ ] All other cells are integers (or simple fractions only if you accept non-integer options)
- [ ] `options[correctIndex]` equals the mathematically correct next term
- [ ] Distractors are plausible (off-by-step, wrong ratio, adjacent term, etc.)

### 4B — Matrix row / column (rows × columns logic)

**Use when:** the puzzle is a **2D number grid**, but the player answers **one missing cell on a single row or column**.

Because the UI only renders **`sequence` as one line**, use this split:

| Field | Content |
|-------|---------|
| `sequence` | **Only the row or column being solved**, pipe-delimited, with `?` in the missing cell — e.g. `5|15|45|?` |
| `question` | One line: `Find the missing number in the highlighted row.` or `Complete the column pattern.` |
| `hint` | **Full grid** as plain text (players may request hint). Example below. |
| `patternKind` | `matrix_row` or `matrix_column` (convention for generators; server accepts any string, validator allows listed kinds in §5) |

**Hint grid format (recommended):**

```text
Grid (row-major):
2  4  8
3  9  27
5  15 ?
Rule: each row multiplies by 3.
```

**Matrix generation rules:**

| Rule | Detail |
|------|--------|
| Grid size | Prefer **3×3** or **3×4**; never exceed **5×5** in hint text |
| Missing cell | Exactly **one** `?` in the target `sequence` line |
| Consistency | Every **row** OR every **column** (or both) must follow a stated rule |
| Numbers | Integers only; keep all values **≤ 9999** for mobile readability |
| Options | Four unique integers; correct answer must match the missing cell |

**Do not** put multiple rows into `sequence` with `;` or newlines — admin CSV parsing only splits `sequence` on **comma or pipe**, and the game UI would show them as one broken line.

---

## 5. `patternKind` vocabulary

Allowed by `validateSequenceQuestionPayload` (`shared/enigmaPulse/validators.js`):

| `patternKind` | Meaning |
|---------------|---------|
| `arithmetic` | Constant difference (+k) |
| `geometric` | Constant ratio (×k) |
| `exponential` | Powers (e.g. 2, 4, 8, 16) |
| `fibonacci` | Each term is sum of previous two |
| `prime` | Prime sequence or prime-indexed pattern |
| `alternating` | Two interleaved sub-rules (e.g. +2, +3, +2, +3) |
| `multi_step` | Second-order or mixed operations |
| `matrix_row` | Missing cell on a row of a grid (hint holds full grid) |
| `matrix_column` | Missing cell on a column of a grid |
| *(empty)* | Allowed |

---

## 6. Difficulty rubric (tag each row `easy` | `medium` | `hard`)

Sequence IQ **loads all three** difficulties per category, then picks rows to match the **node index curve**. Tag each generated row honestly:

| Level | Linear sequences | Matrix row/column |
|-------|------------------|-------------------|
| **easy** | Simple +/× with small integers (steps 1–5, ratios 2–3); 4–5 visible terms | 3×3 grid, one obvious rule (same × across row) |
| **medium** | Alternating steps, squares, mild gaps, two-step rules | 3×4 grid, row rule differs from column rule |
| **hard** | Fibonacci-like, primes, nested rules, larger numbers | 4×4 or subtle column rule; distractors close to correct |

**Batch mix target:** ~35% easy / 40% medium / 25% hard.

---

## 7. Pool sizing (avoid “Not enough questions”)

Per **`category`** (e.g. `Science`):

| Minimum | Why |
|---------|-----|
| **40 unique playable rows** | Two disjoint decks of **20** nodes per match |
| **60+ recommended** | Replay / `enigmaPlayedQuestions` exclusion |
| **≥8 with `sequence` length ≥ 4** | Strong Sequence IQ UX |

Audit script (optional):

```bash
node backend/scripts/enigmaPulse/auditSequenceIqQuestions.mjs
```

---

## 8. MASTER SYSTEM PROMPT (paste into ChatGPT / Claude / Gemini)

```text
You are a puzzle author for "Sequence IQ" — a competitive numeric pattern game (Skilz EnigmaPulse).

OUTPUT RULES (strict):
1. Return ONLY valid JSON — an array of objects. No markdown fences, no commentary.
2. Each object MUST use exactly these keys:
   gameType, category, difficulty, type, question, option1, option2, option3, option4, correctIndex, sequence, patternKind, tags, hint, explanation
3. gameType MUST be "enigma_pulse".
4. type MUST be "riddle_sequence".
5. category MUST be one of: "General Knowledge", "Science", "History", "Sports" (match the user request).
6. difficulty MUST be "easy", "medium", or "hard".
7. question: 1–500 characters, English, describes the task (linear or matrix row/column).
8. sequence: array of strings OR a single pipe-delimited string (you may output either; importer accepts both). Rules:
   - Length 3–8 inclusive.
   - Exactly ONE element must be "?".
   - All other elements are integer numerals as strings (no commas inside numbers).
   - This array is shown horizontally in-game as: cell | cell | ? | cell
9. option1–option4: numeric strings only, all four UNIQUE (case-insensitive), same order of magnitude where possible.
10. correctIndex: integer 0, 1, 2, or 3 matching the single mathematically correct missing value.
11. patternKind: one of arithmetic, geometric, exponential, fibonacci, prime, alternating, multi_step, matrix_row, matrix_column (or "").
12. tags: lowercase comma-separated tokens (e.g. "sequence,geometric,science").
13. hint: short clue without stating the answer; for matrix_row/matrix_column include a row-major ASCII grid in hint.
14. explanation: 1–2 sentences proving the answer (admin review).
15. Randomize correctIndex across the batch (not always 0).
16. Do NOT duplicate the same sequence + options pair in one batch.

QUESTION SHAPES (mix per user request):
A) LINEAR (patternKind not matrix_*): full pattern in sequence, e.g. ["2","5","8","11","?"].
B) MATRIX (patternKind matrix_row or matrix_column): only the target line in sequence; put the full grid + rule in hint.

QUALITY:
- Exactly one correct answer; three distractors from common mistakes (wrong step, wrong ratio, off-by-one term).
- Keep numbers readable (prefer all values ≤ 9999).
- No ambiguous patterns (two equally valid answers).
- For Science/History/Sports categories, you may use numeric facts (years, counts) only when the pattern is still purely numeric.

When ready, output the JSON array only.
```

---

## 9. USER PROMPT TEMPLATES

### 9A — Linear number sequences

```text
Generate {COUNT} Sequence IQ questions (shape A: linear only).

category: {General Knowledge | Science | History | Sports}
difficulty mix: {e.g. "12 easy, 20 medium, 8 hard"}
patternKind distribution: ~30% arithmetic, ~25% geometric, ~15% fibonacci, ~15% alternating, ~15% multi_step/exponential/prime

sequence length: prefer 5–6 nodes including "?"
Language: English.
```

### 9B — Matrix rows and columns

```text
Generate {COUNT} Sequence IQ questions (shape B: matrix row/column).

category: {General Knowledge | Science | History | Sports}
difficulty mix: {easy|medium|hard split}
Split: ~50% matrix_row, ~50% matrix_column
Grid: 3×3 or 3×4 in hint; sequence field contains ONLY the row or column with one "?"
Language: English.
```

### 9C — Mixed batch (recommended for production uploads)

```text
Generate {COUNT} Sequence IQ questions for EnigmaPulse.

category: Science
difficulty mix: 15 easy, 20 medium, 10 hard
Mix: 70% linear (shape A), 30% matrix row/column (shape B)
Ensure no duplicate sequences in the batch.
Language: English.
```

---

## 10. JSON schema (one question)

### Linear example

```json
{
  "gameType": "enigma_pulse",
  "category": "Science",
  "difficulty": "medium",
  "type": "riddle_sequence",
  "question": "What number completes the sequence?",
  "option1": "243",
  "option2": "162",
  "option3": "324",
  "option4": "81",
  "correctIndex": 0,
  "sequence": ["3", "9", "27", "81", "?"],
  "patternKind": "geometric",
  "tags": "sequence,geometric,powers",
  "hint": "Each term is multiplied by the same number.",
  "explanation": "The ratio is 3; 81 × 3 = 243."
}
```

### Matrix row example

```json
{
  "gameType": "enigma_pulse",
  "category": "General Knowledge",
  "difficulty": "easy",
  "type": "riddle_sequence",
  "question": "Find the missing number in the third row.",
  "option1": "45",
  "option2": "30",
  "option3": "15",
  "option4": "60",
  "correctIndex": 0,
  "sequence": ["5", "15", "?"],
  "patternKind": "matrix_row",
  "tags": "matrix,geometric,easy",
  "hint": "Grid:\n2  4  8\n3  9  27\n5  15 ?\nEach row multiplies by 3.",
  "explanation": "Row 3: 5×3=15, 15×3=45."
}
```

---

## 11. Convert JSON → CSV

| CSV column | JSON key |
|------------|----------|
| gameType | gameType |
| category | category |
| difficulty | difficulty |
| type | type |
| question | question |
| option1–option4 | option1–option4 |
| correctIndex | correctIndex |
| sequence | Join `sequence` array with `\|` e.g. `3\|9\|27\|81\|?` |
| patternKind | patternKind |
| tags | tags |
| hint | hint |
| explanation | explanation |

**Import:** Admin dashboard → **BULK CSV / EXCEL** → default game type **`enigma_pulse`** → preview → upload.

---

## 12. Pre-upload validation checklist

- [ ] `gameType` = `enigma_pulse` on every row  
- [ ] `type` = `riddle_sequence`  
- [ ] `category` ∈ {General Knowledge, Science, History, Sports}  
- [ ] `difficulty` ∈ {easy, medium, hard}  
- [ ] `question` length ≤ 500  
- [ ] Four **numeric** options, all unique  
- [ ] `correctIndex` 0–3 matches the unique correct option  
- [ ] `sequence` has **≥3** nodes, **exactly one** `?`  
- [ ] Correct option equals the value that replaces `?` in the pattern  
- [ ] Matrix items: full grid in **`hint`**, not in `sequence`  
- [ ] **≥40** rows per category before launch (60+ preferred)  
- [ ] Spot-check: `node backend/scripts/enigmaPulse/auditSequenceIqQuestions.mjs`

---

## 13. Common mistakes (from codebase)

| Mistake | Why it fails / hurts UX |
|---------|-------------------------|
| `gameType: trivia` | Never selected for EnigmaPulse matches |
| `type: riddle_classic` | Filtered out by `rowMatchesEnigmaGameKey` for Pattern Recognition |
| `category: general_knowledge` | Admin rejects — use exact lobby label `General Knowledge` |
| Multiple `?` in sequence | Ambiguous; breaks player trust |
| `sequence` empty | Falls back to text-only; weak Sequence IQ branding |
| `correctIndex` points to wrong option | Wrong scoring |
| Duplicate options (`12` twice) | Admin preview rejects row |
| Putting `;` or newlines in `sequence` for grids | Parsed as one flat line; use hint for grid |
| Only 10 questions in pool | Deck needs **20** nodes/player → short matches / errors |
| Lobby difficulty = hard but only easy rows uploaded | Still works, but nodes 11–20 may repeat easy unless enough hard tags |

---

## 14. Optional repair prompt

```text
Review the JSON array below for Sequence IQ (enigma_pulse / riddle_sequence). Fix: duplicate sequences, wrong correctIndex, non-unique options, multiple "?", sequence length < 3, non-numeric options, invalid category strings, matrix grids missing from hint, or pattern/answer mismatch. Return the corrected JSON array only.
```

---

*Aligned with: `PatternRecognition.jsx`, `shared/enigmaPulse/validators.js`, `shared/enigmaPulse/gameKeys.js`, `shared/enigmaPulse/constants.js`, `enigmaQuestionSelection.js`, `enigmaPulseRealtime.js`, `firestoreQuestionAdmin.js`, `AdminQuestions.jsx`.*
