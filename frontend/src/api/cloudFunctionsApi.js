import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/functionsClient.js';

const DEV_FN_HINT =
  ' [Dev] Callable failed to reach Cloud Functions. Fix: (1) Deploy from `backend/`: `firebase deploy --only functions`, or (2) Emulator: `VITE_USE_FUNCTIONS_EMULATOR=true`, `npm run emulate:functions`, restart Vite. If DevTools shows 403 on OPTIONS to cloudfunctions.net, the Gen2 function needs public HTTP invoke (see `invoker: "public"` in `backend/functions/index.js` and README Firebase section).';

function mapErr(err) {
  const code = err?.code || '';
  const msg = err?.message || 'Request failed';
  const detail = () => msg.replace(/^.*?:\s*/, '') || '';
  if (code === 'functions/unauthenticated') return new Error('Sign in required.');
  if (code === 'functions/permission-denied') return new Error('Permission denied.');
  if (code === 'functions/not-found') return new Error(detail() || 'Not found.');
  if (code === 'functions/failed-precondition') return new Error(detail() || 'Precondition failed.');
  if (code === 'functions/invalid-argument') return new Error(detail() || 'Invalid argument.');
  if (code === 'functions/already-exists') return new Error(detail() || 'Already exists.');
  if (code === 'functions/resource-exhausted') return new Error(detail() || 'Too many requests.');

  const networkLike =
    import.meta.env.DEV &&
    /failed to fetch|load failed|networkerror|access control|cors|blocked by cors/i.test(String(msg));
  if (networkLike) {
    console.error('[cloudFunctionsApi] callable network/cors failure', { code, msg });
    return new Error(`${msg}${DEV_FN_HINT}`);
  }
  console.error('[cloudFunctionsApi] callable failure', { code, msg });
  return new Error(msg);
}

const getPlayerDashboardFn = httpsCallable(functions, 'getPlayerDashboard');
const getPlayerBillingFn = httpsCallable(functions, 'getPlayerBilling');
const addTransactionFn = httpsCallable(functions, 'addTransaction');
const updateGameStatsFn = httpsCallable(functions, 'updateGameStats');
const getLeaderboardFn = httpsCallable(functions, 'getLeaderboard');
const sendChallengeFn = httpsCallable(functions, 'sendChallenge');
const acceptChallengeFn = httpsCallable(functions, 'acceptChallenge');
const sendInviteFn = httpsCallable(functions, 'sendInvite');
const acceptInviteFn = httpsCallable(functions, 'acceptInvite');
const rejectChallengeFn = httpsCallable(functions, 'rejectChallenge');
const markNotificationReadFn = httpsCallable(functions, 'markNotificationRead');
const listAvailablePlayersFn = httpsCallable(functions, 'listAvailablePlayers');
const createMatchFn = httpsCallable(functions, 'createMatch');
const joinMatchFn = httpsCallable(functions, 'joinMatch');
const findMatchFn = httpsCallable(functions, 'findMatch');
const submitAnswerFn = httpsCallable(functions, 'submitAnswer');
const neuroChainStartPracticeFn = httpsCallable(functions, 'neuroChainStartPractice');
const neuroChainEnqueue1v1Fn = httpsCallable(functions, 'neuroChainEnqueue1v1');
const neuroChainLeaveQueueFn = httpsCallable(functions, 'neuroChainLeaveQueue');
const neuroChainTryMatchFn = httpsCallable(functions, 'neuroChainTryMatch');
const neuroChainStartInviteFromMatchFn = httpsCallable(functions, 'neuroChainStartInviteFromMatch');
const neuroChainSubmitAnswerFn = httpsCallable(functions, 'neuroChainSubmitAnswer');
const neuroChainProcessBotTurnFn = httpsCallable(functions, 'neuroChainProcessBotTurn');
const neuroChainResolveRoundIfStaleFn = httpsCallable(functions, 'neuroChainResolveRoundIfStale');
const cognitiveStartPracticeFn = httpsCallable(functions, 'cognitiveStartPractice');
const cognitiveEnqueue1v1Fn = httpsCallable(functions, 'cognitiveEnqueue1v1');
const cognitiveLeaveQueueFn = httpsCallable(functions, 'cognitiveLeaveQueue');
const cognitiveTryMatchFn = httpsCallable(functions, 'cognitiveTryMatch');
const cognitiveSubmitAnswerFn = httpsCallable(functions, 'cognitiveSubmitAnswer');
const cognitiveProcessBotTurnFn = httpsCallable(functions, 'cognitiveProcessBotTurn');
const cognitiveResolveRoundIfStaleFn = httpsCallable(functions, 'cognitiveResolveRoundIfStale');

export async function callGetPlayerDashboard() {
  try {
    const res = await getPlayerDashboardFn();
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callGetPlayerBilling() {
  try {
    const res = await getPlayerBillingFn();
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callAddTransaction(payload) {
  try {
    const res = await addTransactionFn(payload);
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{
 *   coinsDelta?: number,
 *   xpDelta?: number,
 *   winsDelta?: number,
 *   lossesDelta?: number,
 *   challengesDelta?: number,
 *   monthKey?: string,
 *   mathRush?: { matches?: number, wins?: number, failures?: number, successes?: number },
 * }} payload
 */
export async function callUpdateGameStats(payload) {
  try {
    const res = await updateGameStatsFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ entries: Array<{ rank: number, uid: string, displayName: string, photoURL: string, xp: number, level: number, wins: number }> }>}
 */
export async function callGetLeaderboard(opts = {}) {
  try {
    const res = await getLeaderboardFn({ limit: opts.limit });
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ toUserId: string, gameId: string, gameName?: string }} payload
 * @returns {Promise<{ inviteId: string }>}
 */
export async function callSendChallenge(payload) {
  try {
    const res = await sendChallengeFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ inviteId: string }} payload
 */
export async function callAcceptChallenge(payload) {
  try {
    const res = await acceptChallengeFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callSendInvite(payload) {
  try {
    const res = await sendInviteFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callAcceptInvite(payload) {
  try {
    const res = await acceptInviteFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ inviteId: string }} payload
 */
export async function callRejectChallenge(payload) {
  try {
    const res = await rejectChallengeFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ notificationId: string }} payload
 */
export async function callMarkNotificationRead(payload) {
  try {
    const res = await markNotificationReadFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

/**
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ players: Array<{ uid: string, displayName: string, photoURL: string, email: string, presence: object }> }>}
 */
export async function callListAvailablePlayers(opts = {}) {
  try {
    const res = await listAvailablePlayersFn({ limit: opts.limit });
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCreateMatch(payload) {
  try {
    const res = await createMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callJoinMatch(payload) {
  try {
    const res = await joinMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callFindMatch(payload) {
  try {
    const res = await findMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callSubmitAnswer(payload) {
  try {
    const res = await submitAnswerFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainStartPractice(payload) {
  try {
    const res = await neuroChainStartPracticeFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainEnqueue1v1(payload) {
  try {
    const res = await neuroChainEnqueue1v1Fn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainLeaveQueue(payload) {
  try {
    const res = await neuroChainLeaveQueueFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainTryMatch(payload) {
  try {
    const res = await neuroChainTryMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainStartInviteFromMatch(payload) {
  try {
    const res = await neuroChainStartInviteFromMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainSubmitAnswer(payload) {
  try {
    const res = await neuroChainSubmitAnswerFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainProcessBotTurn(payload) {
  try {
    const res = await neuroChainProcessBotTurnFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callNeuroChainResolveRoundIfStale(payload) {
  try {
    const res = await neuroChainResolveRoundIfStaleFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveStartPractice(payload) {
  try {
    const res = await cognitiveStartPracticeFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveEnqueue1v1(payload) {
  try {
    const res = await cognitiveEnqueue1v1Fn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveLeaveQueue(payload) {
  try {
    const res = await cognitiveLeaveQueueFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveTryMatch(payload) {
  try {
    const res = await cognitiveTryMatchFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveSubmitAnswer(payload) {
  try {
    const res = await cognitiveSubmitAnswerFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveProcessBotTurn(payload) {
  try {
    const res = await cognitiveProcessBotTurnFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}

export async function callCognitiveResolveRoundIfStale(payload) {
  try {
    const res = await cognitiveResolveRoundIfStaleFn(payload || {});
    return res.data;
  } catch (e) {
    throw mapErr(e);
  }
}
