# Trivia Pakistan — AI Question Generation Prompt Pack

Use this document to generate **History of Pakistan** and **Current Affairs of Pakistan** MCQs for the Skilz Trivia lobby (`TriviaLobby.jsx` → `TriviaGameRoom.jsx`), then import via **Admin → Trivia & EnigmaPulse question bank** (CSV/Excel bulk upload or single-row form).

---

## 1. How lobby categories map to the database

| Lobby card | `category` value (required) | Aliases accepted by server |
|------------|----------------------------|----------------------------|
| **History** | `history` | `History`, `General Knowledge`, `general_knowledge` |
| **Current Affairs** | `current_affairs` | `Current Affairs`, `current affairs`, `current-affairs` |

Lobby code (`TriviaLobby.jsx`):

```js

{ id: 'history', value: 'history', title: 'History' }
{ id: 'current-affairs', value: 'current_affairs', title: 'Current Affairs' }

```

Matchmaking sends `category` + `difficulty` (`easy` | `medium` | `hard`). The server loads **10 active questions** per match from Firestore (`fetchQuestionsFromFirestore`).

---

## 2. Required fields (admin + server validation)

| Column / field | Required | Rules |
|----------------|----------|--------|
| `gameType` | Yes (bulk) | Must be `trivia` — **not** `enigma_pulse` |
| `category` | Yes | `history` or `current_affairs` only for these two games |
| `difficulty` | Yes | `easy`, `medium`, or `hard` |
| `question` | Yes | 1–500 characters; shown as MCQ stem in game |
| `option1` … `option4` | Yes | All non-empty; **unique** (case-insensitive) |
| `correctIndex` | Yes | Integer **0–3** (0 = option1, 1 = option2, …) |
| `type` | No for trivia | Leave **empty** or omit (Enigma-only) |
| `tags` | Optional | Comma-separated, e.g. `pakistan,independence,1947` |
| `active` | Optional | Default `true`; only `active=true` rows are picked for play |
| `hint` | Optional | Stored in Firestore; **not shown** in Trivia game UI today |
| `explanation` | Optional | Stored; **not shown** in Trivia game UI today |
| `sequence`, `patternKind` | No | EnigmaPulse only — omit for trivia |

**Not used in admin form but supported at runtime:** `imageUrl` (game can display if present in Firestore doc).

### Bulk CSV header (copy exactly)

```csv
category,difficulty,question,option1,option2,option3,option4,correctIndex,gameType,tags,hint,explanation
```

---

## 3. Gameplay constraints (write questions that fit the UI)

- **Format:** Four-option multiple choice only.
- **Stem length:** Up to 500 characters. History / current affairs use a **prose stem** (`trivia-room-question-stem`) — one or two clear sentences are ideal; avoid walls of text.
- **Options:** Short phrases (ideally under ~80 characters each). No “A/B/C/D” prefixes in option text.
- **One correct answer:** Exactly one option is factually correct; distractors must be plausible but clearly wrong to an informed player.
- **No trick wording:** Avoid “all of the above”, “none of the above”, double negatives, or ambiguous dates unless difficulty is `hard`.
- **Turn-based match:** Questions are independent; no ordering or “previous question” references.
- **Pakistan focus:** Stems should be clearly about **Pakistan** (history, polity, geography, society, or Pakistan’s role in events).

---

## 4. Difficulty rubric

| Level | History of Pakistan | Current Affairs of Pakistan |
|-------|---------------------|-----------------------------|
| **easy** | Landmark facts (1947, Quaid, national symbols, capitals, major rivers, obvious leaders) | Headlines most educated adults in Pakistan would know |
| **medium** | Specific dates, constitutional articles, wars/battles, ministries, treaties | Named policies, appointments, election years, major 12–24 month events |
| **hard** | Obscure dates, minority details, pre-partition nuance, exact numbers | Fine-grained stats, secondary appointments, treaty clauses, niche economic indicators |

Aim for **~40% easy / 40% medium / 20% hard** per batch.

---

## 5. MASTER SYSTEM PROMPT (paste into ChatGPT / Claude / Gemini)

```text
You are a senior Pakistan Studies and GK examiner building multiple-choice questions for a real-money trivia mobile/web game (Skilz Trivia).

OUTPUT RULES (strict):
1. Return ONLY valid JSON — an array of objects. No markdown fences, no commentary.
2. Each object MUST use exactly these keys:
   gameType, category, difficulty, question, option1, option2, option3, option4, correctIndex, tags, hint, explanation
3. gameType MUST always be the string "trivia".
4. category MUST be either "history" OR "current_affairs" (match the user’s requested category).
5. difficulty MUST be "easy", "medium", or "hard".
6. question: 1–500 characters, English, factually accurate, focused on Pakistan.
7. option1–option4: non-empty strings, all four UNIQUE (case-insensitive), similar length where possible.
8. correctIndex: integer 0, 1, 2, or 3 (0 = option1).
9. tags: lowercase comma-separated tokens (e.g. "pakistan,constitution,1973").
10. hint: one short clue without giving away the answer.
11. explanation: 1–2 sentences citing the fact (for admin review; players do not see it in-game).
12. Do NOT include: type, sequence, patternKind, or enigma_pulse fields.
13. Avoid disputed claims without consensus; prefer widely taught Pakistani curriculum / reputable sources.
14. For current_affairs: prefer events from the last 18 months; include year in stem when timing matters.
15. Randomize which option position is correct across the batch (correctIndex should not always be 0).

QUALITY:
- One unambiguous correct answer.
- Distractors from the same domain (e.g. other presidents, other years, neighboring facts).
- No copy-paste duplicate stems in one batch.
- Balanced difficulty per user request.

When ready, output the JSON array only.
```

---

## 6. USER PROMPT TEMPLATES (fill and send after the system prompt)

### 6A — History of Pakistan

```text
Generate {COUNT} trivia questions for Pakistan History.

category: history
difficulty mix: {easy|medium|hard OR "10 easy, 15 medium, 5 hard"}
topics to cover (pick across batch): Indus Valley / ancient, arrival of Islam, Mughal era, British Raj, Pakistan Movement, 1947 partition, early years (1947–1958), Ayub/Khan eras, 1971, Bhutto, Zia, 1990s, Musharraf, 2008–present constitutional milestones, culture (Urdu, sports, Nobel), geography (provinces, rivers, borders).

Avoid: questions that are primarily about India-only history unless Pakistan’s role is central.
Language: English.
```

### 6B — Current Affairs of Pakistan

```text
Generate {COUNT} trivia questions for Pakistan Current Affairs.

category: current_affairs
difficulty mix: {easy|medium|hard OR mix specification}
time window: events primarily from {MONTH YEAR} through {MONTH YEAR} (today: May 2026).
topics to cover (distribute): federal/provincial government, elections & politics, economy (IMF, inflation, budget headlines), foreign policy (China, US, Afghanistan, Middle East), CPEC/Gwadar, defence tests/exercises, sports (cricket PCB), science/tech, disasters, major court rulings, IMF/World Bank, census/statistics releases.

Each stem should name Pakistan explicitly or clearly imply it.
Flag any fact you are uncertain about in the explanation field with "verify:" prefix.
Language: English.
```

---

## 7. JSON schema (one question)

```json
{
  "gameType": "trivia",
  "category": "history",
  "difficulty": "medium",
  "question": "In which year did Pakistan adopt its first constitution that declared the country an Islamic Republic?",
  "option1": "1956",
  "option2": "1962",
  "option3": "1973",
  "option4": "1949",
  "correctIndex": 0,
  "tags": "pakistan,constitution,1956",
  "hint": "This constitution was abrogated before the 1962 constitution.",
  "explanation": "The Constitution of 1956 was adopted on 23 March 1956 and declared Pakistan an Islamic Republic."
}
```

```json
{
  "gameType": "trivia",
  "category": "current_affairs",
  "difficulty": "easy",
  "question": "Which city hosts the headquarters of the State Bank of Pakistan?",
  "option1": "Karachi",
  "option2": "Islamabad",
  "option3": "Lahore",
  "option4": "Rawalpindi",
  "correctIndex": 0,
  "tags": "pakistan,economy,sbp",
  "hint": "It is Pakistan's largest port city.",
  "explanation": "The State Bank of Pakistan is headquartered in Karachi."
}
```

---

## 8. Convert JSON → CSV (for admin bulk upload)

For each object, one row:

| CSV column | JSON key |
|------------|----------|
| category | category |
| difficulty | difficulty |
| question | question |
| option1–option4 | option1–option4 |
| correctIndex | correctIndex |
| gameType | gameType |
| tags | tags |
| hint | hint |
| explanation | explanation |

Example row:

```csv
history,medium,"In which year did Pakistan adopt its first constitution that declared the country an Islamic Republic?",1956,1962,1973,1949,0,trivia,"pakistan,constitution,1956","First Islamic Republic constitution before 1962.","Constitution of 1956 adopted 23 March 1956."
```

**Import path:** Admin dashboard → **BULK CSV / EXCEL** → set default game type **trivia** → preview → upload valid rows.

---

## 9. Pre-upload validation checklist

- [ ] `gameType` = `trivia` on every row  
- [ ] `category` is exactly `history` or `current_affairs`  
- [ ] `difficulty` ∈ {`easy`,`medium`,`hard`}  
- [ ] `question` length ≤ 500  
- [ ] Four options present and unique (case-insensitive)  
- [ ] `correctIndex` 0–3 matches the factually correct option  
- [ ] No empty `type` column needed for trivia  
- [ ] `active` true (default on create)  
- [ ] At least **10+ questions per category × difficulty** so matches do not fail with “No questions available”  
- [ ] Spot-check current affairs dates (stale CA questions harm player trust)

---

## 10. Common mistakes (from codebase review)

| Mistake | Why it fails |
|---------|----------------|
| `gameType: enigma_pulse` | Trivia bank query does not filter gameType, but admin/validation expects trivia rows; Enigma categories differ |
| `category: General Knowledge` | Works only as legacy alias for **history**, not for current affairs |
| `correctIndex: 1` meaning “option B” but correct answer in option1 | Wrong scoring in game |
| Duplicate options (“Lahore” twice) | Admin preview rejects row |
| Question > 500 chars | Server rejects |
| Only 5 questions in pool | Match needs **10** per game; insufficient pool errors |

Existing sample file `backend/scripts/enigmaPulse/sample-imports/pakistan_gk_current_affairs_mcqs.csv` uses **`enigma_pulse`** and **`General Knowledge`** — **re-tag** as `trivia` + `history` or `current_affairs` before using for Trivia lobby.

---

## 11. Optional follow-up prompt (batch repair)

```text
Review the JSON array below. Fix any: duplicate stems, duplicate options, wrong correctIndex, category/difficulty mismatch, questions over 500 characters, non-trivia gameType, or facts that are outdated for current_affairs. Return the corrected JSON array only.
```

---

## 12. Suggested tag vocabulary

**History:** `pakistan`, `partition`, `1947`, `mughal`, `british_raj`, `constitution`, `1973`, `kargil`, `culture`, `geography`, `quaid`, `liaquat`

**Current affairs:** `pakistan`, `politics`, `economy`, `cpec`, `cricket`, `foreign_policy`, `sbp`, `imf`, `election`, `supreme_court`, `2025`, `2026`

---

*Aligned with: `AdminQuestions.jsx` (`validateRowPreview`), `firestoreQuestionAdmin.js`, `firestoreQuestionBank.js`, `triviaRealtime.js`, `TriviaLobby.jsx`, `TriviaGameRoom.jsx`.*
