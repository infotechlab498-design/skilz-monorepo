# Wave 2 — Platform-wide JSON retirement (plan)

Ludo now persists match state in Firestore (`ludoMatches`) and uses Firestore wallets for entry fees / prizes (`users/{uid}`). The following **remain on JSON** (`backend/src/services/dataService.js` and `data/*.json`) and should be migrated in a second wave:

| Area | Files / consumers | Target |
|------|-------------------|--------|
| User directory | `users.json`, registration APIs | Firestore `users/{uid}` only; retire duplicate JSON row |
| Scores / leaderboard | `scores.json`, `scoreController.js` | Firestore aggregates or dedicated collection |
| Legacy game rooms | `game_rooms.json`, `gameController.js` | Firestore or deprecate |
| Checkout / games list | `games.json`, `checkoutController.js` | Firestore |
| Plans | `plans.json` | Firestore or static config |
| Invitations | `invitations.json` | Already partially on Firestore for social flows |
| HTTP `matches.json` | `server.js` inline file DB | Firestore `matches` or remove |

## Order of operations

1. Identify all API routes still mutating JSON for authenticated Firebase users.
2. Dual-write JSON + Firestore behind a feature flag; compare reads.
3. Flip reads to Firestore; monitor errors.
4. Remove JSON writes; archive `data/*.json`.

## Non-goals for Wave 2 doc

- Changing Trivia/Math Rush socket protocols (separate test matrix).
- Migrating Cloud Functions billing (already Firestore-first in `functions/`).
