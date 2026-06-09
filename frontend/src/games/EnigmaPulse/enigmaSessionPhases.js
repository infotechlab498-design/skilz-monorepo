/** @typedef {'connecting' | 'matchmaking' | 'deck_preparing' | 'starting' | 'playing' | 'preparing'} EnigmaSessionPhase */

export const ENIGMA_BOOT_MESSAGES = {
  connecting: 'Establishing secure session…',
  matchmaking: 'Synchronizing neural patterns…',
  deck_preparing: 'Building question deck…',
  starting: 'Deploying first node…',
  playing: 'Loading match…',
  preparing: 'Preparing your match…',
};

export const SEQUENCE_IQ_BOOT_MESSAGES = {
  connecting: 'Establishing secure uplink…',
  matchmaking: 'Synchronizing neural patterns…',
  deck_preparing: 'Generating puzzle matrix…',
  starting: 'Deploying first node…',
};

export function bootHeadlineForPhase(phase) {
  switch (phase) {
    case 'connecting':
      return 'Linking';
    case 'matchmaking':
      return 'Matchmaking';
    case 'deck_preparing':
    case 'preparing':
      return 'Calibrating';
    case 'starting':
      return 'Arming';
    default:
      return 'Loading';
  }
}
