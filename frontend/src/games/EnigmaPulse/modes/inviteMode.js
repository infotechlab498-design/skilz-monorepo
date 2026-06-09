export function buildInvitePayload({
  targetUserId,
  targetEmail,
  category,
  difficulty,
  gameKey,
}) {
  return {
    targetUserId: String(targetUserId || '').trim() || undefined,
    targetEmail: String(targetEmail || '').trim() || undefined,
    category,
    difficulty,
    gameKey,
  };
}
