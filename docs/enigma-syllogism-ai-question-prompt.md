# EnigmaPulse Syllogism — AI Question Generation Prompt Pack

Use this document to generate **deductive logic / syllogistic reasoning** questions for **Syllogism** (`Syllogism.jsx`), then import via **Admin → Trivia & EnigmaPulse question bank** (CSV/Excel bulk upload or single-row form).

> **Not the numbers game:** Numeric sequences and **matrix rows/columns** belong to **Sequence IQ (Pattern Recognition)** — see `docs/enigma-pattern-recognition-ai-question-prompt.md`. Syllogism is **text-only MCQ**; its “rows” are **premise lines** and its “columns” are the **2×2 answer grid**.

---

## 1. What the game is (code truth)

| Layer | Value |
|-------|--------|
| Lobby tile | **Syllogism** |
| Socket `gameKey` | `syllogism` |
| Route | `/enigmaPulse/syllogism` (joining: `/enigmaPulse/syllogism/joining`) |
| Firestore `gameType` | **`enigma_pulse`** (required) |
| Firestore `type` | **`syllogism`** (alias accepted at import: `syllogism_logic`, `syllogistic`) |
| Firestore `category` | **`Syllogism`** only (reserved; not lobby chips like Science) |
| Engine | Classic MCQ — player taps an **option string**; server grades by `correctIndex` |
| Match size | **10 questions per human** (`ENIGMA_PULSE.QUESTION_COUNT`) |
| Timer | **15 seconds** per question (Syllogism-specific rule) |
| Question pool fetch | Merges **easy + medium + hard** for category `Syllogism` |
| In-match difficulty curve | Q1–5 → prefer `easy`; Q6–10 → prefer `medium` |
| Deck rule | **Strict:** both players need **10 unique** questions or match fails (`EP_SYLLOGISM_DECK_INCOMPLETE`) |
| Lobby category chips | Ignored for content — queue normalizes category to **`Syllogism`** (`shared/enigmaPulse/validators.js`) |

### UI layout (`Syllogism.jsx` + `Syllogism.css`)

The client does **not** render number grids or `sequence` arrays.

| UI region | Source | CSS / behavior |
|-----------|--------|----------------|
| **Premise row(s)** | Upper part of `question` after `splitQuestionDisplay()` | `.sy-question-line--premises` (gradient text) |
| **Question row** | Last line / interrogative tail of `question` | `.sy-question-line--ask` |
| **Answer grid** | `options[0..3]` | `.sy-options-grid` → **2 columns × 2 rows** (A top-left, B top-right, C bottom-left, D bottom-right) |
| Power-ups | Server + local state | 50-50 (uses `fiftyFiftyKeep`), Skip, Double points |

**`splitQuestionDisplay(text)` rules** (how `question` becomes two visual rows):

1. If `question` has **2+ newline-separated lines**, all but the last line → **premises**; last line → **question row**.
2. Else if text matches a trailing interrogative (`Are`, `Is`, `Which`, `What`, `If`, … + `?`), split there.
3. Else if there is a `?`, split after the last `. ` before `?`.
4. Else entire string is shown as a **single** premise block.

**Recommended authoring:** use explicit newlines so premises and the ask-line always split correctly.

---

## 2. Category and type (required — do not mix with lobby categories)

| Field | Required value |
|-------|----------------|
| `gameType` | `enigma_pulse` |
| `category` | **`Syllogism`** (exact capitalization) |
| `type` | **`syllogism`** |

Admin **rejects**:

- `enigma_pulse,Science,easy,syllogism,...` (wrong category)
- `enigma_pulse,Syllogism,easy,riddle_classic,...` (wrong type)

---

## 3. Required & optional fields (admin + Firestore)

| Column / field | Required | Rules |
|----------------|----------|--------|
| `gameType` | Yes (bulk) | `enigma_pulse` |
| `category` | Yes | **`Syllogism`** |
| `type` | Yes | **`syllogism`** |
| `difficulty` | Yes | `easy`, `medium`, or `hard` — used for **in-match slot curve** (§6) |
| `question` | Yes | 1–500 characters; English; see §4 formatting |
| `option1` … `option4` | Yes | All non-empty; **unique** (case-insensitive); complete sentences |
| `correctIndex` | Yes | Integer **0–3** (0 = option1) |
| `tags` | Optional | Comma-separated, e.g. `syllogism,conclusion_mcq,all-some,easy` |
| `hint` | Optional | Stored; **not shown** in Syllogism match UI today |
| `explanation` | Optional | Admin review / future use |
| `active` | Optional | Default `true`; only `active=true` rows are selected |
| `sequence` | **Do not use** | Ignored by Syllogism UI (Sequence IQ only) |
| `patternKind` | Optional | Use as **`syllogismKind`** taxonomy (§5) if you want structured batches |

### Bulk CSV header (copy exactly)

```csv
gameType,category,difficulty,type,question,option1,option2,option3,option4,correctIndex,tags,hint,explanation,active
```

Example row:

```csv
enigma_pulse,Syllogism,medium,syllogism,"All poets are readers.
Some writers are poets.
Which conclusion must be true?","Some writers are readers.","All writers are readers.","No writers are readers.","Some readers are not writers.",0,"syllogism,conclusion_mcq,all-some,medium",,"From All A→B and Some C→A, Some C→B follows.",true
```

---

## 4. Two supported question shapes (logic, not number grids)

### 4A — Conclusion MCQ (primary; best UX)

**Use when:** player must pick the **one conclusion that logically follows** from the premises.

| Property | Rule |
|----------|------|
| `question` | **2–4 premise lines** + final **interrogative line** (see newline layout below) |
| `option1`–`option4` | Four **candidate conclusions** (not “Valid/Invalid” labels unless you intend Shape B) |
| `syllogismKind` (tag) | `conclusion_mcq` |
| Premise grammar | Prefer standard forms: **All X are Y**, **No X are Y**, **Some X are Y**, **Some X are not Y** |

**Recommended `question` layout (newlines):**

```text
All mammals are warm-blooded.
All whales are mammals.
Which conclusion must be true?
```

**In-game display:**

- **Premise row:** `All mammals are warm-blooded. All whales are mammals.` (joined if multiple premise lines)
- **Question row:** `Which conclusion must be true?`
- **Grid:** four conclusion buttons in 2×2 layout

**Generator checks:**

- [ ] Exactly **one** option is **entailed** by the premises (standard Aristotelian syllogism or clear Venn logic)
- [ ] Three distractors are **plausible** (reversed quantifier, illicit major/minor, converse error)
- [ ] Premises are **consistent** (no hidden contradiction)
- [ ] `correctIndex` points to the entailed option

---

### 4B — Validity / meta MCQ (secondary)

**Use when:** premises **and** a proposed conclusion are given; player judges the **logical status** of that conclusion.

| Property | Rule |
|----------|------|
| `question` | Premises + **stated conclusion** + ask-line, e.g. `Is the conclusion valid?` |
| `option1`–`option4` | Fixed set recommended for consistency: `Valid conclusion`, `Invalid conclusion`, `Cannot be determined`, `Contradiction in premises` |
| `syllogismKind` (tag) | `validity_mcq` |
| `correctIndex` | `0` = entailed, `1` = contradicted, `2` = unknown, `3` = premises contradict |

**Example `question`:**

```text
All artists are creative.
Some teachers are artists.
Conclusion: Some teachers are creative.
Is this conclusion valid?
```

**Generator checks:**

- [ ] Run logical closure mentally (or use a validator); map outcome to the four labels above
- [ ] Do not mix Shape A conclusion text into Shape B options

---

### 4C — Quantitative syllogism (optional “numbers in logic” variant)

**Use when:** premises use **counts or inequalities**, but the game is still **text MCQ** (not Sequence IQ).

| Property | Rule |
|----------|------|
| `question` | Numeric premises + ask-line |
| `options` | Four **numeric or comparative** answers (`42`, `More than 10`, etc.) |
| `syllogismKind` (tag) | `quantitative_mcq` |

**Example:**

```text
Every box in shipment A weighs 2 kg.
Shipment A has 5 boxes.
What is the total weight of shipment A?
```

This is **not** a row/column matrix puzzle; for grids use Pattern Recognition.

---

## 5. `syllogismKind` / tags vocabulary

Store in `tags` and/or `patternKind` for batch control:

| Kind | Meaning |
|------|---------|
| `conclusion_mcq` | Shape 4A — pick entailed conclusion |
| `validity_mcq` | Shape 4B — valid / invalid / unknown / contradiction |
| `quantitative_mcq` | Shape 4C — arithmetic from stated rules |
| `all-all` | Premise pattern: All… All… |
| `all-some` | All… Some… |
| `some-no` | Some… No… |
| `three-premise` | Three or more premises |
| `trick-distractor` | Distractors use converse / illicit conversion |

**Statement quantifiers** (use consistently in English):

| Form | Template |
|------|----------|
| Universal affirmative | `All A are B` |
| Universal negative | `No A are B` |
| Particular affirmative | `Some A are B` |
| Particular negative | `Some A are not B` |

**Terms:** Use short, concrete nouns (animals, jobs, shapes, sports roles) — avoid ambiguous pronouns.

---

## 6. Difficulty rubric (tag each row `easy` | `medium` | `hard`)

The server prefers difficulty by **question index in the 10-question match**:

| Match slot | Preferred `difficulty` tag |
|------------|----------------------------|
| Questions 1–5 | `easy` |
| Questions 6–10 | `medium` |

(`hard` rows are fetched into the pool but **not** preferred until index 11+, which never occurs in Syllogism — still upload **some** `hard` rows as fallback when easy/medium pools are thin.)

| Level | Shape A (conclusion) | Shape B (validity) |
|-------|----------------------|---------------------|
| **easy** | 1–2 premises; All/No only; obvious Venn | 2 premises; conclusion matches or clearly violates |
| **medium** | 2 premises; Some involved; one trap distractor | 2–3 premises; “cannot be determined” is correct sometimes |
| **hard** | 3 premises or subtle quantifier trap | 3 premises; contradiction or unknown is correct |

**Batch mix target:** ~40% easy / 45% medium / 15% hard.

---

## 7. Pool sizing (avoid `EP_SYLLOGISM_DECK_INCOMPLETE`)

Syllogism requires **10 unique questions per player** per match (disjoint decks in 1v1).

| Minimum | Why |
|---------|-----|
| **25 unique playable rows** | Bare minimum for one bot/human match with little replay exclusion |
| **40+ recommended** | Comfortable 1v1 with `enigmaPlayedQuestions` history |
| **60+ ideal** | Production replay variety |

Every row must pass `rowMatchesEnigmaGameKey(row, 'syllogism')`:

- `category` = `Syllogism`
- `type` = `syllogism` or `syllogism_logic`
- Valid 4-option MCQ + `correctIndex`

---

## 8. MASTER SYSTEM PROMPT (paste into ChatGPT / Claude / Gemini)

```text
You are a logic-puzzle author for "Syllogism" — a competitive deductive-reasoning game (Skilz EnigmaPulse).

OUTPUT RULES (strict):
1. Return ONLY valid JSON — an array of objects. No markdown fences, no commentary.
2. Each object MUST use exactly these keys:
   gameType, category, difficulty, type, question, option1, option2, option3, option4, correctIndex, tags, hint, explanation, active
3. gameType MUST be "enigma_pulse".
4. category MUST be "Syllogism" (exact spelling).
5. type MUST be "syllogism".
6. difficulty MUST be "easy", "medium", or "hard".
7. question: 1–500 characters, English. Structure for the game UI:
   - Use newline characters between premise lines and the final ask-line.
   - Final line MUST be an interrogative (e.g. "Which conclusion must be true?" or "Is this conclusion valid?").
   - Do NOT use bullet characters unless you want them shown; prefer plain sentences per line.
8. option1–option4: four complete English sentences, all UNIQUE (case-insensitive).
9. correctIndex: integer 0, 1, 2, or 3 — exactly one correct option.
10. tags: lowercase comma-separated; MUST start with "syllogism," and include syllogismKind: conclusion_mcq | validity_mcq | quantitative_mcq, plus premise pattern tags (e.g. all-some).
11. hint: optional short clue without giving the answer (may be empty string).
12. explanation: 1–3 sentences proving why correctIndex is right (admin review).
13. active: true.
14. Randomize correctIndex across the batch (not always 0).
15. Do NOT duplicate the same question+options pair in one batch.
16. Do NOT generate numeric sequence grids, pipe-delimited sequences, or matrix puzzles — those belong to a different game.

QUESTION SHAPES (mix per user request):
A) conclusion_mcq: 2–4 premises + ask-line; options are four possible conclusions; exactly one is entailed.
B) validity_mcq: premises + stated conclusion + "Is this conclusion valid?"; options EXACTLY:
   "Valid conclusion", "Invalid conclusion", "Cannot be determined", "Contradiction in premises"
   with correctIndex 0=entailed, 1=contradicted, 2=unknown, 3=premises contradict.
C) quantitative_mcq: premises with explicit numbers; options are numeric answers; still text MCQ.

LOGIC QUALITY:
- Use clear nouns for categories (cats, doctors, squares, etc.).
- Premises must be logically consistent unless Shape B answer is "Contradiction in premises".
- Distractors: converse error, illicit major/minor, wrong quantifier (All vs Some), or plausible but unproven statement.
- Keep premise lines short (≤120 chars each); total question ≤500 chars.

When ready, output the JSON array only.
```

---

## 9. USER PROMPT TEMPLATES

### 9A — Conclusion MCQ batch (Shape A)

```text
Generate {COUNT} Syllogism questions for EnigmaPulse (Shape A: conclusion_mcq only).

category: Syllogism
difficulty mix: {e.g. "16 easy, 18 medium, 6 hard"}
Premise patterns: ~40% all-all, ~35% all-some, ~25% some-no or three-premise
Use newline formatting: premises on separate lines, final line is the question.
Language: English.
```

### 9B — Validity MCQ batch (Shape B)

```text
Generate {COUNT} Syllogism questions (Shape B: validity_mcq only).

category: Syllogism
difficulty mix: {easy|medium|hard split}
Use the four fixed validity options and correctIndex mapping from the system prompt.
Include at least 20% where correct answer is "Cannot be determined".
Language: English.
```

### 9C — Mixed production batch (recommended)

```text
Generate {COUNT} Syllogism questions for EnigmaPulse admin import.

category: Syllogism
difficulty mix: 20 easy, 22 medium, 8 hard
Mix: 75% conclusion_mcq (A), 20% validity_mcq (B), 5% quantitative_mcq (C)
No duplicate premise sets. Randomize correctIndex.
Language: English.
```

---

## 10. JSON schema (one question)

### Shape A — conclusion MCQ

```json
{
  "gameType": "enigma_pulse",
  "category": "Syllogism",
  "difficulty": "medium",
  "type": "syllogism",
  "question": "All poets are readers.\nSome writers are poets.\nWhich conclusion must be true?",
  "option1": "Some writers are readers.",
  "option2": "All writers are readers.",
  "option3": "No writers are readers.",
  "option4": "Some readers are not writers.",
  "correctIndex": 0,
  "tags": "syllogism,conclusion_mcq,all-some,medium",
  "hint": "Combine the universal rule with the particular overlap.",
  "explanation": "All poets are readers and some writers are poets, so those writers must be readers.",
  "active": true

  
}
```

### Shape B — validity MCQ

```json
{
  "gameType": "enigma_pulse",
  "category": "Syllogism",
  "difficulty": "hard",
  "type": "syllogism",
  "question": "All managers are employees.\nSome employees are interns.\nConclusion: Some managers are interns.\nIs this conclusion valid?",
  "option1": "Valid conclusion",
  "option2": "Invalid conclusion",
  "option3": "Cannot be determined",
  "option4": "Contradiction in premises",
  "correctIndex": 2,
  "tags": "syllogism,validity_mcq,all-some,hard",
  "hint": "",
  "explanation": "The premises do not force overlap between managers and interns.",
  "active": true



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
| question | question (preserve `\n` inside quoted CSV field) |
| option1–option4 | option1–option4 |
| correctIndex | correctIndex |
| tags | tags |
| hint | hint |
| explanation | explanation |
| active | active |

**Import:** Admin dashboard → **BULK CSV / EXCEL** → game type **`enigma_pulse`** → set type filter **syllogism** → preview → upload.

---

## 12. Pre-upload validation checklist

- [ ] `gameType` = `enigma_pulse` on every row  
- [ ] `category` = **`Syllogism`** (not Science / General Knowledge)  
- [ ] `type` = **`syllogism`**  
- [ ] `difficulty` ∈ {easy, medium, hard}  
- [ ] `question` length ≤ 500; contains newline before final ask-line when possible  
- [ ] Four **unique** options (case-insensitive)  
- [ ] `correctIndex` 0–3 matches the **single** logically correct choice  
- [ ] Shape B uses the **exact** four validity option strings if you want consistent UX  
- [ ] No `sequence` / pipe grids (wrong game)  
- [ ] **≥25** rows before testing; **≥40** recommended for production  
- [ ] Spot-check logic by hand or with a syllogism validator  

---

## 13. Common mistakes (from codebase)

| Mistake | Why it fails / hurts UX |
|---------|-------------------------|
| `category: General Knowledge` | Row excluded — Syllogism requires `category: Syllogism` |
| `type: riddle_classic` | Filtered out by `rowMatchesEnigmaGameKey` for syllogism |
| `gameType: trivia` | Never selected for EnigmaPulse |
| Single-line `question` with no `?` | Whole text shows as one block; weaker premise/question split |
| Multiple correct conclusions | Breaks trust and scoring |
| `correctIndex` mismatch | Wrong scoring |
| Duplicate options | Admin preview rejects row |
| Only 10 questions in pool | 1v1 needs **disjoint** 10+10 decks → `EP_SYLLOGISM_DECK_INCOMPLETE` |
| Uploading numeric `sequence` grids | Ignored in UI; use Pattern Recognition doc instead |
| Using lobby difficulty as Firestore category | Lobby chips do not apply — always **Syllogism** |

---

## 14. Optional repair prompt

```text
Review the JSON array below for EnigmaPulse Syllogism (enigma_pulse / category Syllogism / type syllogism). Fix: wrong category or type, duplicate questions, wrong correctIndex, non-unique options, question over 500 chars, missing final ask-line, ambiguous logic (multiple correct options), Shape B options not matching the four validity labels, or validity mapping (0=entailed,1=contradicted,2=unknown,3=contradiction). Return the corrected JSON array only.
```

---

## 15. Related: Sequence IQ (numbers / rows / columns)

If you need **numeric patterns**, **pipe sequences** (`3|9|27|?`), or **matrix row/column** puzzles, use:

**`docs/enigma-pattern-recognition-ai-question-prompt.md`**

| Feature | Syllogism | Sequence IQ |
|---------|-----------|-------------|
| `gameKey` | `syllogism` | `pattern_recognition` |
| `type` | `syllogism` | `riddle_sequence` |
| `category` | `Syllogism` | General Knowledge / Science / History / Sports |
| Primary field | `question` (text) | `question` + `sequence` |
| UI grid | 2×2 **text** options | Horizontal **number** cells + 2×2 options |

---

*Aligned with: `Syllogism.jsx`, `shared/enigmaPulse/validators.js`, `shared/enigmaPulse/constants.js`, `enigmaQuestionSelection.js`, `enigmaPulseRealtime.js`, `firestoreQuestionAdmin.js`, `AdminQuestions.jsx`, `docs/QUESTION_SYSTEM_RUNBOOK.md` §9.*
