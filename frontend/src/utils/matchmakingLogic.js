



// export function findBestMatch(currentPlayer, availablePlayers) {

//   if (!currentPlayer || !availablePlayers?.length) return null;

//   const MY_LEVEL = currentPlayer.profile.level;
//   const MY_XP = currentPlayer.profile.xp;

//   //  YOU CONTROL THESE RULES

//   const MAX_LEVEL_DIFF = 2;
//   const MAX_XP_DIFF = 300;

//   // 1️ Filter eligible players

//   const eligiblePlayers = availablePlayers.filter((p) => {
//     if (!p?.profile) return false;
// // 
//     const levelDiff = Math.abs(p.profile.level - MY_LEVEL);
//     const xpDiff = Math.abs(p.profile.xp - MY_XP);

//     return levelDiff <= MAX_LEVEL_DIFF && xpDiff <= MAX_XP_DIFF;
//   });

//   if (!eligiblePlayers.length) {
//     // 2️ Fallback: closest XP player
//     return availablePlayers.reduce((closest, p) => {
//       const diff = Math.abs(p.profile.xp - MY_XP);
//       return diff < closest.diff ? { player: p, diff } : closest;
//     }, { player: null, diff: Infinity }).player;
//   }

//   // 3 Pick best match (smallest XP diff)
//   return eligiblePlayers.sort((a, b) => {
//     const diffA = Math.abs(a.profile.xp - MY_XP);
//     const diffB = Math.abs(b.profile.xp - MY_XP);
//     return diffA - diffB;
//   })[0];
// }


// Temporary BOT definition (replace later)


const BOT_PLAYER = {
  uid: 'BOT_001',
  isBot: true,
  profile: {
    displayName: 'AI Bot',
    level: 5,
    xp: 250,
    avatar: '/bots/bot.png',
  },
};

export function findBestMatch(currentPlayer, availablePlayers = []) {
  if (!currentPlayer?.profile) return BOT_PLAYER;

  const MY_LEVEL = currentPlayer.profile.level;
  const MY_XP = currentPlayer.profile.xp;

  //  MATCHMAKING RULES (YOU CONTROL THESE)

  const MAX_LEVEL_DIFF = 2;
  const MAX_XP_DIFF = 300;


  const filteredPlayers = availablePlayers.filter(
    (p) => p?.uid && p.uid !== currentPlayer.uid
  );


  if (!filteredPlayers.length) {
    return BOT_PLAYER;
  }


  const eligiblePlayers = filteredPlayers.filter((p) => {
    if (!p?.profile) return false;

    const levelDiff = Math.abs(p.profile.level - MY_LEVEL);
    const xpDiff = Math.abs(p.profile.xp - MY_XP);

    return levelDiff <= MAX_LEVEL_DIFF && xpDiff <= MAX_XP_DIFF;
  });


  if (eligiblePlayers.length) {
    return eligiblePlayers.sort((a, b) => {
      const diffA = Math.abs(a.profile.xp - MY_XP);
      const diffB = Math.abs(b.profile.xp - MY_XP);
      return diffA - diffB;
    })[0];
  }


  const closestPlayer = filteredPlayers.reduce(
    (closest, p) => {
      const diff = Math.abs(p.profile.xp - MY_XP);
      return diff < closest.diff ? { player: p, diff } : closest;
    },
    { player: null, diff: Infinity }
  ).player;

  return closestPlayer || BOT_PLAYER;
}
