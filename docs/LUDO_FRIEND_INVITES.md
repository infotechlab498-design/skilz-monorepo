# Ludo friend invites (Socket.IO)

## Flow

1. Host taps **Invite** on a friend in [`LudoLobby`](../frontend/src/games/LudoLobby.jsx): first invite creates a private room (`ludo:createRoom` with `inviteOnly: true`); each invite sends `ludo:sendInvite` with `toUserId`, `roomId`, `ttlMs`.
2. Friend receives `ludo:inviteReceived` (global [`LudoInviteListener`](../frontend/src/games/ludoGame/components/LudoInviteListener.jsx)): modal with countdown; **Accept** navigates to `/ludo/game/:roomId` with `state.inviteId`; **Reject** emits `ludo:rejectInvite`.
3. Guest client emits `ludo:joinRoom` with `inviteId` (required for `inviteOnly` rooms).
4. Host gets `ludo:inviteResult` on accept/reject and `ludo:inviteExpired` on TTL.

## Server events

| Event | Role |
|-------|------|
| `ludo:createRoom` | Host creates room; set `inviteOnly` via `isPrivate` / `inviteOnly` payload. |
| `ludo:sendInvite` / `ludo:inviteFriend` | Host sends invite (same handler). |
| `ludo:rejectInvite` / `ludo:inviteRespond` (reject) | Guest declines. |
| `ludo:joinRoom` | Guest joins with `{ roomId, displayName, inviteId? }`. |

## Storage

- With `REDIS_URL`, invites persist in Redis (`ludo:invite:*` keys) for multi-node validation.
- Without Redis, invites are in-memory on the Node process (dev only).

## Manual QA

1. Two browsers, two accounts, mutual friends: A invites B → B sees modal → Accept → both in same `roomId` (A as host already in room, B joins lobby).
2. B rejects → A sees decline toast.
3. Wait for TTL → A sees expired toast (if invite not consumed).
