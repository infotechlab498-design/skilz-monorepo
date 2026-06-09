export function computeVoteSummary(votesByUid = {}, memberUids = []) {
  let addBotsCount = 0;
  let humanOnlyCount = 0;
  for (const uid of memberUids) {
    const vote = votesByUid[uid];
    if (vote === 'ADD_BOTS') addBotsCount += 1;
    if (vote === 'HUMANS_ONLY') humanOnlyCount += 1;
  }
  return { addBotsCount, humanOnlyCount };
}

export function resolveVoteOutcome(votesByUid = {}, memberUids = []) {
  const { addBotsCount, humanOnlyCount } = computeVoteSummary(votesByUid, memberUids);
  return {
    addBotsCount,
    humanOnlyCount,
    outcome: addBotsCount >= humanOnlyCount ? 'ADD_BOTS' : 'HUMANS_ONLY',
  };
}
