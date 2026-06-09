/**
 * Firebase Cloud Functions — barrel entry (modular handlers under ./handlers).
 * Region must match VITE_FIREBASE_FUNCTIONS_REGION in the web app (default us-central1).
 */
const { onCall } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { db } = require('./lib/admin.js');
const { runGetPlayerDashboard, runGetPlayerBilling } = require('./handlers/dashboard.js');
const { runAddTransaction } = require('./handlers/payments.js');
const { runUpdateGameStats } = require('./handlers/game.js');
const { runGetLeaderboard } = require('./handlers/leaderboard.js');
const { runLeaderboardRollup } = require('./handlers/leaderboardRollup.js');
const {
  runSendChallenge,
  runAcceptChallenge,
  runRejectChallenge,
  runMarkNotificationRead,
  runListAvailablePlayers,
  runExpirePendingInvites,
} = require('./handlers/social.js');
const {
  runCreateMatch,
  runJoinMatch,
  runFindMatch,
  runSubmitAnswer,
} = require('./handlers/triviaMatch.js');
const {
  runStartPractice: runNeuroChainStartPractice,
  runEnqueue1v1: runNeuroChainEnqueue1v1,
  runLeaveQueue: runNeuroChainLeaveQueue,
  runTryMatch: runNeuroChainTryMatch,
  runStartInviteFromMatch: runNeuroChainStartInviteFromMatch,
  runSubmitAnswer: runNeuroChainSubmitAnswer,
  runProcessBotTurn: runNeuroChainProcessBotTurn,
  runResolveRoundIfStale: runNeuroChainResolveRoundIfStale,
} = require('./handlers/neuroChain.js');
const {
  runStartPractice: runCognitiveStartPractice,
  runEnqueue1v1: runCognitiveEnqueue1v1,
  runLeaveQueue: runCognitiveLeaveQueue,
  runTryMatch: runCognitiveTryMatch,
  runSubmitAnswer: runCognitiveSubmitAnswer,
  runProcessBotTurn: runCognitiveProcessBotTurn,
  runResolveRoundIfStale: runCognitiveResolveRoundIfStale,
} = require('./handlers/cognitiveArena.js');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

/**
 * Callable (onCall) functions are fronted by Cloud Run. If the Cloud Run service does not allow
 * unauthenticated invocation (allUsers: Cloud Run Invoker), Google Front End returns 403 for
 * OPTIONS/POST *before* Firebase callable CORS runs — the browser then reports a CORS failure.
 * That is not Firestore rules. Fix: Cloud console → Cloud Run → service for this function →
 * allow unauthenticated, or gcloud: roles/run.invoker for allUsers.
 */
const callableOpts = { cors: true };

exports.getPlayerDashboard = onCall(callableOpts, (request) => runGetPlayerDashboard(db, request));
exports.getPlayerBilling = onCall(callableOpts, (request) => runGetPlayerBilling(db, request));
exports.addTransaction = onCall(callableOpts, (request) => runAddTransaction(db, request));
exports.updateGameStats = onCall(callableOpts, (request) => runUpdateGameStats(db, request));
exports.getLeaderboard = onCall(callableOpts, (request) => runGetLeaderboard(db, request));

exports.sendChallenge = onCall(callableOpts, (request) => runSendChallenge(db, request));
exports.acceptChallenge = onCall(callableOpts, (request) => runAcceptChallenge(db, request));
exports.sendInvite = onCall(callableOpts, (request) => runSendChallenge(db, request));
exports.acceptInvite = onCall(callableOpts, (request) => runAcceptChallenge(db, request));
exports.rejectChallenge = onCall(callableOpts, (request) => runRejectChallenge(db, request));
exports.markNotificationRead = onCall(callableOpts, (request) => runMarkNotificationRead(db, request));
exports.listAvailablePlayers = onCall(callableOpts, (request) => runListAvailablePlayers(db, request));
exports.createMatch = onCall(callableOpts, (request) => runCreateMatch(db, request));
exports.joinMatch = onCall(callableOpts, (request) => runJoinMatch(db, request));
exports.findMatch = onCall(callableOpts, (request) => runFindMatch(db, request));
exports.submitAnswer = onCall(callableOpts, (request) => runSubmitAnswer(db, request));

exports.neuroChainStartPractice = onCall(callableOpts, (request) => runNeuroChainStartPractice(db, request));
exports.neuroChainEnqueue1v1 = onCall(callableOpts, (request) => runNeuroChainEnqueue1v1(db, request));
exports.neuroChainLeaveQueue = onCall(callableOpts, (request) => runNeuroChainLeaveQueue(db, request));
exports.neuroChainTryMatch = onCall(callableOpts, (request) => runNeuroChainTryMatch(db, request));
exports.neuroChainStartInviteFromMatch = onCall(callableOpts, (request) =>
  runNeuroChainStartInviteFromMatch(db, request)
);
exports.neuroChainSubmitAnswer = onCall(callableOpts, (request) => runNeuroChainSubmitAnswer(db, request));
exports.neuroChainProcessBotTurn = onCall(callableOpts, (request) => runNeuroChainProcessBotTurn(db, request));
exports.neuroChainResolveRoundIfStale = onCall(callableOpts, (request) =>
  runNeuroChainResolveRoundIfStale(db, request)
);

exports.cognitiveStartPractice = onCall(callableOpts, (request) => runCognitiveStartPractice(db, request));
exports.cognitiveEnqueue1v1 = onCall(callableOpts, (request) => runCognitiveEnqueue1v1(db, request));
exports.cognitiveLeaveQueue = onCall(callableOpts, (request) => runCognitiveLeaveQueue(db, request));
exports.cognitiveTryMatch = onCall(callableOpts, (request) => runCognitiveTryMatch(db, request));
exports.cognitiveSubmitAnswer = onCall(callableOpts, (request) => runCognitiveSubmitAnswer(db, request));
exports.cognitiveProcessBotTurn = onCall(callableOpts, (request) => runCognitiveProcessBotTurn(db, request));
exports.cognitiveResolveRoundIfStale = onCall(callableOpts, (request) =>
  runCognitiveResolveRoundIfStale(db, request)
);

exports.expirePendingInvites = onSchedule('every 60 minutes', async () => {
  await runExpirePendingInvites(db);
});

/** Denormalized XP leaderboard snapshot (`leaderboardRollup/current`). Complements callable `getLeaderboard`. */
exports.refreshLeaderboardRollup = onSchedule('every 6 hours', async () => {
  await runLeaderboardRollup(db);
});
