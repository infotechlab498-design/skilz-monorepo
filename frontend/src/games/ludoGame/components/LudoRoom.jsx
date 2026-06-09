import React, { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Toaster } from 'sonner';
import { Board } from './Board';
import { GameStatus, PlayerType, PlayerColor } from '../types';
import { COLOR_CLASSES } from '../constants';
import { buildPlayerListFromLudoState } from '../ludoStateViewModel.js';
import { useLudoCelebration } from '../hooks/useLudoCelebration.js';
import { LudoCelebrationOverlay } from './celebration/LudoCelebrationOverlay.jsx';
import { LudoVictoryModal } from './celebration/LudoVictoryModal.jsx';
import { standingsList } from '../utils/ludoStandings.js';

const MotionDiv = motion.div;
const MotionButton = motion.button;

export const LudoRoom = ({
    state,
    rollDice,
    moveToken,
    resetGame,
    onQuitMatch,
    validMoves,
    onPlayAgain,
    enforceSeatForRoll = false,
}) => {
    const { coins: reduxCoins, xp: reduxXp } = useSelector((s) => s.user);
    const { user: authUser } = useSelector((s) => s.auth);
    const authUid = authUser?.uid || '';
    const isSeatedMe = useCallback(
      (playerId) =>
        playerId &&
        authUid &&
        (playerId === authUid || String(playerId).startsWith(`${authUid}_seat_`)),
      [authUid]
    );

    const celebration = useLudoCelebration(state, authUid, isSeatedMe);

    const currentPlayer = state.players[state.currentTurn];
    const isHumanTurn = currentPlayer?.type === PlayerType.HUMAN;
    const canRollThisSeat =
        isHumanTurn &&
        (!enforceSeatForRoll || isSeatedMe(currentPlayer?.id));
    const inputsBlocked =
        celebration.celebrationActive ||
        celebration.showModal ||
        state.status === GameStatus.FINISHED;
    const rollDisabled =
        !canRollThisSeat ||
        state.isRolling ||
        state.waitingForMove ||
        inputsBlocked;

    const seatedPlayers = useMemo(() => buildPlayerListFromLudoState(state), [state]);
    const dieFace =
        Number.isFinite(state.diceValue) && state.diceValue >= 1 && state.diceValue <= 6
            ? state.diceValue
            : null;

    const handleMoveToken = useCallback(
      (tokenId) => {
        if (inputsBlocked) return;
        moveToken(tokenId);
      },
      [inputsBlocked, moveToken]
    );

    const handleRollDice = useCallback(() => {
      if (rollDisabled) return;
      rollDice();
    }, [rollDisabled, rollDice]);

    const handleContinue = useCallback(() => {
      celebration.onContinue();
      if (state.status === GameStatus.FINISHED) {
        (onPlayAgain || resetGame)();
      }
    }, [celebration, state.status, onPlayAgain, resetGame]);

    const overlayIntensity = celebration.phase === 'personal' ? 'light' : 'full';
    const modalMode = celebration.phase === 'personal' ? 'personal' : 'match';
    const continueLabel =
      state.status === GameStatus.FINISHED
        ? (onPlayAgain ? 'Back to lobby' : 'Play Again')
        : 'Continue';

    return (
        <>
        <Toaster position="top-center" richColors closeButton />
        <LudoCelebrationOverlay
          active={celebration.overlayActive}
          winnerColor={celebration.winnerColor}
          showSkip={celebration.canSkip && celebration.phase !== 'idle'}
          onSkip={celebration.skipCelebration}
          interactive={celebration.celebrationActive}
          intensity={overlayIntensity}
        />
        <LudoVictoryModal
          open={celebration.showModal}
          mode={modalMode}
          focusEntry={celebration.focusEntry}
          standings={celebration.standings.length ? celebration.standings : standingsList(state)}
          showRankReveal={celebration.showRankReveal}
          myPlayerId={authUid}
          isSeatedMe={isSeatedMe}
          onContinue={handleContinue}
          continueLabel={continueLabel}
          reactions={celebration.reactions}
          onReaction={celebration.phase === 'match' ? celebration.onReaction : undefined}
        />

        <div className={`game-room-layout ${celebration.overlayActive ? 'ludo-room--celebrating' : ''}`}>

            <div className="left-panel">
                <MotionDiv
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="live-players-card glass-card"
                >
                    <h3 className="panel-label">Live Players</h3>
                    <div className="player-list">
                        {seatedPlayers.map(({ color, name, type }) => {
                            const isActive = state.currentTurn === color;
                            const lastRoll =
                                Number.isFinite(Number(state.rollByColor?.[color]))
                                    ? Number(state.rollByColor?.[color])
                                    : null;
                            return (
                                <MotionDiv
                                    key={color}
                                    animate={{
                                        scale: isActive ? 1.05 : 1,
                                        borderColor: isActive ? 'rgba(85, 81, 255, 0.5)' : 'rgba(255,255,255,0.1)'
                                    }}
                                    className={`sidebar-player-card ${isActive ? 'active' : ''}`}
                                >
                                    <div className={`player-status-dot ${COLOR_CLASSES[color]}`} />
                                    <div className="player-details">
                                        <h4>{name}</h4>
                                        <p>{type}{lastRoll != null ? ` • Roll: ${lastRoll}` : ''}</p>
                                    </div>
                                </MotionDiv>
                            );
                        })}
                    </div>
                </MotionDiv>
                <button type="button" onClick={onQuitMatch} className="quit-btn-new">QUIT MATCH</button>
            </div>

            <div className="center-panel">
                <div
                  className={[
                    'board-wrapper',
                    'board-wrapper--premium',
                    celebration.overlayActive ? 'board-wrapper--celebrate' : '',
                    celebration.winnerColor ? `board-wrapper--aura-${celebration.winnerColor.toLowerCase()}` : '',
                  ].filter(Boolean).join(' ')}
                >
                    <Board
                        gameState={state}
                        validMoves={inputsBlocked ? [] : validMoves}
                        onTokenClick={handleMoveToken}
                        celebrationActive={celebration.overlayActive}
                        celebrationWinnerColor={celebration.winnerColor}
                    />
                </div>

                <MotionDiv
                    className="dice-card glass-card"
                    whileHover={{ scale: inputsBlocked ? 1 : 1.02 }}
                >
                    <div className="dice-result-box">
                        <label>DICE</label>
                        <MotionDiv
                            className={`value-display ${dieFace != null ? 'active' : ''}`}
                            animate={state.isRolling ? {
                                rotate: [0, 90, 180, 270, 360],
                                scale: [1, 1.2, 1]
                            } : { rotate: 0, scale: 1 }}
                            transition={{ repeat: state.isRolling ? Infinity : 0, duration: 0.4 }}
                        >
                            {state.isRolling ? '🎲' : (dieFace != null ? String(dieFace) : '—')}
                        </MotionDiv>
                    </div>

                    <MotionButton
                        disabled={rollDisabled}
                        onClick={handleRollDice}
                        className="roll-action-btn"
                        whileHover={{ scale: rollDisabled ? 1 : 1.05 }}
                        whileTap={{ scale: rollDisabled ? 1 : 0.95 }}
                    >
                        ROLL DICE
                    </MotionButton>
                </MotionDiv>
            </div>

            <div className="history-sidebar">
                <div className="leaderboard-card">
                    <div className="card-header-main">
                        <h3 className="panel-label">Leaderboard</h3>
                    </div>
                    <div className="leaderboard-list">
                        {([PlayerColor.RED, PlayerColor.BLUE, PlayerColor.YELLOW, PlayerColor.GREEN]).map((color) => {
                            const p = state.players[color];
                            if (!p || p.type === PlayerType.EMPTY) return null;

                            const isActive = state.currentTurn === color;
                            const botDiff = state.botDifficulties?.[color];

                            return (
                                <div key={color} className={`stat-card-new card-${color} ${isActive ? 'active' : ''}`}>
                                    <div className="stat-card-header">
                                        <div className="avatar-initial">{p.name?.[0].toUpperCase() || '?'}</div>
                                        <div className="player-meta">
                                            <h4>{p.name}</h4>
                                            <p>{p.type} {botDiff ? `• ${botDiff}` : ''}</p>
                                        </div>
                                    </div>

                                    <div className="pills-container">
                                        <div className="stat-pill-new coins">
                                            <span className="pill-label">COINS</span>
                                            <span className="pill-value">
                                                {p.type === PlayerType.HUMAN && p.id === authUid
                                                    ? reduxCoins
                                                    : (p.coins || 0)}
                                            </span>
                                        </div>
                                        <div className="stat-pill-new xp">
                                            <span className="pill-label">XP</span>
                                            <span className="pill-value">
                                                {p.type === PlayerType.HUMAN && isSeatedMe(p.id)
                                                    ? reduxXp
                                                    : (p.xp || 0)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="history-card">
                    <div className="card-header-main">
                        <h3 className="panel-label">Match History</h3>
                        <div className="live-indicator"></div>
                    </div>
                    <div className="history-log-list">
                        {(state.logs || []).map((log, idx) => (
                            <div key={log?.id ?? `log-${idx}-${String(log?.msg ?? '').slice(0, 16)}`} className="history-entry">
                                {typeof log === 'string' ? log : log?.msg}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};
