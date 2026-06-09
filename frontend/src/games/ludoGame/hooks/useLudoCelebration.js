import React from 'react';
import { toast } from 'sonner';
import { GameStatus } from '../types.js';
import {
  standingsList,
  isPlayerMe,
  findMyColor,
} from '../utils/ludoStandings.js';
import {
  fireMatchCelebration,
  firePersonalCelebration,
  stopCelebrationEffects,
  prefersReducedMotion,
} from '../utils/ludoCelebration.js';

const PERSONAL_MS = 2500;
const MATCH_CELEBRATION_MS = 5500;
const SKIP_DELAY_MS = 2000;

/**
 * Two-phase celebration:
 * - Phase 1 (personal): human just entered winners while still PLAYING
 * - Phase 2 (match): status FINISHED — full celebration for all clients
 */
export function useLudoCelebration(state, authUid, isSeatedMe) {
  const [phase, setPhase] = React.useState('idle');
  const [showModal, setShowModal] = React.useState(false);
  const [showRankReveal, setShowRankReveal] = React.useState(false);
  const [canSkip, setCanSkip] = React.useState(false);
  const [focusEntry, setFocusEntry] = React.useState(null);
  const [standings, setStandings] = React.useState([]);
  const [winnerColor, setWinnerColor] = React.useState('GREEN');
  const [reactions, setReactions] = React.useState([]);

  const prevWinnersLen = React.useRef(0);
  const prevStatus = React.useRef(state?.status);
  const shownPersonalRanks = React.useRef(new Set());
  const matchCelebrationDone = React.useRef(false);
  const timers = React.useRef([]);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = React.useCallback((fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  const resetCelebration = React.useCallback(() => {
    clearTimers();
    stopCelebrationEffects();
    setPhase('idle');
    setShowModal(false);
    setShowRankReveal(false);
    setCanSkip(false);
    setFocusEntry(null);
    setStandings([]);
    setReactions([]);
  }, [clearTimers]);

  const skipCelebration = React.useCallback(() => {
    clearTimers();
    stopCelebrationEffects();
    if (phase === 'personal') {
      setPhase('idle');
      setShowModal(false);
      setCanSkip(false);
      return;
    }
    if (phase === 'match') {
      setShowRankReveal(true);
      setCanSkip(false);
    }
  }, [phase, clearTimers]);

  const startPersonalCelebration = React.useCallback(
    (entry) => {
      if (!entry || shownPersonalRanks.current.has(entry.rank)) return;
      shownPersonalRanks.current.add(entry.rank);

      setPhase('personal');
      setWinnerColor(entry.color);
      setFocusEntry(entry);
      setStandings([]);
      setShowRankReveal(false);
      setShowModal(true);
      setCanSkip(false);

      firePersonalCelebration(entry.color);

      schedule(() => setCanSkip(true), SKIP_DELAY_MS);
      schedule(() => {
        setShowModal(false);
        setPhase('idle');
        setCanSkip(false);
      }, PERSONAL_MS);
    },
    [schedule]
  );

  const startMatchCelebration = React.useCallback(
    (list) => {
      if (matchCelebrationDone.current) {
        setStandings(list);
        setShowModal(true);
        setShowRankReveal(true);
        setPhase('match');
        return;
      }
      matchCelebrationDone.current = true;

      const top = list[0];
      const myColor = findMyColor(state, authUid, isSeatedMe);
      const myEntry = list.find((r) => isPlayerMe(r, authUid, isSeatedMe));
      const focus = myEntry || top;

      setPhase('match');
      setWinnerColor(top?.color || 'GREEN');
      setStandings(list);
      setFocusEntry(focus);
      setShowRankReveal(false);
      setShowModal(false);
      setCanSkip(false);

      if (!prefersReducedMotion()) {
        fireMatchCelebration(top?.color || 'GREEN', MATCH_CELEBRATION_MS);
      }

      schedule(() => setCanSkip(true), SKIP_DELAY_MS);
      schedule(() => {
        setShowModal(true);
        setShowRankReveal(true);
      }, prefersReducedMotion() ? 0 : MATCH_CELEBRATION_MS);
    },
    [schedule, state, authUid, isSeatedMe]
  );

  React.useEffect(() => {
    const status = state?.status;
    const list = standingsList(state);
    const winnersLen = list.length;

    if (status === GameStatus.FINISHED && prevStatus.current !== GameStatus.FINISHED) {
      startMatchCelebration(list);
    } else if (
      status === GameStatus.FINISHED &&
      !matchCelebrationDone.current &&
      winnersLen > 0
    ) {
      startMatchCelebration(list);
    } else if (
      status === GameStatus.PLAYING &&
      winnersLen > prevWinnersLen.current
    ) {
      const newEntries = list.slice(prevWinnersLen.current);
      newEntries.forEach((entry) => {
        const isMe = isPlayerMe(entry, authUid, isSeatedMe);
        const player = state.players?.[entry.color];
        const isHuman = player?.type === 'HUMAN';

        if (isMe && isHuman) {
          startPersonalCelebration({
            ...entry,
            name: entry.name || player?.name,
            xp: player?.xp,
          });
        } else {
          toast.message(
            `${entry.name || entry.color} finished — Rank #${entry.rank}`,
            { duration: 2200, icon: '🎯' }
          );
        }
      });
    }

    prevWinnersLen.current = winnersLen;
    prevStatus.current = status;
  }, [
    state,
    state?.status,
    state?.winners,
    authUid,
    isSeatedMe,
    startMatchCelebration,
    startPersonalCelebration,
  ]);

  React.useEffect(() => () => {
    clearTimers();
    stopCelebrationEffects();
  }, [clearTimers]);

  const celebrationActive = phase === 'personal' || (phase === 'match' && !showModal);
  const overlayActive = celebrationActive || (phase === 'match' && showModal);

  const onReaction = React.useCallback((emoji) => {
    setReactions((prev) =>
      prev.includes(emoji) ? prev.filter((e) => e !== emoji) : [...prev, emoji]
    );
    toast.message(`Sent ${emoji}`, { duration: 1200 });
  }, []);

  const onContinue = React.useCallback(() => {
    resetCelebration();
  }, [resetCelebration]);

  return {
    phase,
    showModal,
    showRankReveal,
    canSkip,
    focusEntry,
    standings,
    winnerColor,
    reactions,
    celebrationActive,
    overlayActive,
    skipCelebration,
    onReaction,
    onContinue,
    resetCelebration,
  };
}
