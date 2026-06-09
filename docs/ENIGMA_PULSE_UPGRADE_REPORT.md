# EnigmaPulse upgrade report (isolated, backward compatible)

## 1. Analysis — shared vs EnigmaPulse-only

| Area | Classification | Notes |
|------|----------------|-------|
| `frontend/src/games/mathRush/lib/socket.js` | **Shared** | Not modified. EnigmaPulse only imports the shared socket client. |
| `backend/src/services/mathRushRealtime.js`, `triviaRealtime.js` | **Other games** | Not modified. |
| `backend/src/services/enigmaPulseRealtime.js` | **EnigmaPulse-only** | Socket registration for `ep_*` events; match lifecycle. |
| `shared/enigmaPulse/constants.js` | **EnigmaPulse-only** | Only imported by Enigma backend + EnigmaPulse React screens. |
| `shared/enigmaPulse/validators.js` | **EnigmaPulse-only** | Only imported by `enigmaPulseRealtime.js`. |
| `backend/src/services/enigmaPulse/**` | **EnigmaPulse-only** | Engines, AI batch, Firestore repos, new `engine/` folder. |
| `frontend/src/games/EnigmaPulse/**` | **EnigmaPulse-only** | Lobby + game room UI. |

## 2. Changes made (EnigmaPulse scope only)

- Added `backend/src/services/enigmaPulse/engine/AnswerValidator.js` — `normalizeAnswer`, `enrichQuestionForPlay`, `isAnswerCorrect`, `getHintPreview`.
- Added `backend/src/services/enigmaPulse/engine/RiddleEngine.js` — text-first validation pipeline (still accepts legacy `selectedIndex`).
- `engines/riddleClassicEngine.js` now re-exports `RiddleEngine as RiddleClassicEngine` (registry unchanged, no breaking import paths).
- `enigmaPulseRealtime.js` — hint uses `getHintPreview`; bot uses `acceptedAnswers` + two-phase delay (typing window + answer); composite bot timer cancellation.
- `shared/enigmaPulse/constants.js` — play-phase socket strings namespaced (`ep_question_start`, `ep_submit_answer`, etc.).
- `frontend/src/games/EnigmaPulse/EnigmaPulseGameRoom.jsx` + `EnigmaPulseLobby.jsx` — listen/emit using `EnigmaPulseEvents`; submit uses `ep_submit_answer`.
- `aiBatchGenerator.js` — prompt + persistence include `acceptedAnswers` and `normalizedAnswer` with validation.
- `AnswerValidator.test.js` — unit tests for normalization and matching.

## 3. New validation system

- **Model (Firestore):** Existing `options[]` and `correctIndex` are **retained**. New optional fields: `acceptedAnswers: string[]`, `normalizedAnswer: string` (canonical normalized form).
- **Runtime:** `enrichQuestionForPlay` supplies defaults when fields are missing: `acceptedAnswers` defaults to `[correct option text]`; `normalizedAnswer` defaults from the correct option.
- **Matching:** Normalize user input; accept exact match against `normalizedAnswer` or any normalized entry in `acceptedAnswers`; optional Levenshtein ≤ 1 for strings length ≥ 4.
- **Legacy MCQ path:** `selectedIndex` still works inside `RiddleEngine.validateAnswer` for backward compatibility (not used by current UI).

## 4. Data migration strategy

- **No destructive migration.** Old documents without new fields continue to work via enrichment fallback.
- **New / batch data:** Run existing batch script; persisted docs now include `acceptedAnswers` and `normalizedAnswer` when generation succeeds validation.

## 5. Bot update

- Bot chooses text from `acceptedAnswers[0]` when present, else correct option text.
- Wrong-answer simulation still prefers a wrong option or second alias.
- **Typing simulation:** first delay slice (`typingMs`), then answer submission (`answerAfterMs`), both cancellable via `clearBotTimer`.

## 6. Testing results

| Suite | Result |
|-------|--------|
| `npm run build -w @skilz/frontend` | Pass |
| `npm run test -w @skilz/backend` | Pass (14 existing + new Enigma validator tests when picked up by glob) |

Note: backend `test` script is `node --test "src/**/*.test.js"` — new test file path `.../engine/AnswerValidator.test.js` is under `src/` and matches the glob.

## 7. Safety confirmation

- **MathRush** still uses `submit_answer` and its own handlers — unchanged.
- **Trivia** still uses `trivia_*` events — unchanged.
- **Ludo** — no edits to Ludo modules.
- **Shared socket helper** (`mathRush/lib/socket.js`) — not modified; EnigmaPulse only consumes it.
