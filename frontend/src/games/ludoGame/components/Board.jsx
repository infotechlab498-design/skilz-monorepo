import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerColor } from '../types';
import { calculateNextPosition } from '../engine/gameLogic';
import {
  COLOR_CLASSES,
  POSITION_MAP,
  HOME_STRETCH_MAP,
  YARD_COORDINATES,
  FINISH_ZONE_COORDINATES,
  GLOBAL_SAFE_SQUARES,
  HOME_POSITION,
} from '../constants';

const BLOCK_MIN_SIZE = 2;

const coordKey = (r, c) => `${r}-${c}`;

const getPositionCoords = (position, color) => {
  if (position <= 0) return null;
  if (position < 53) return POSITION_MAP[position];
  if (position < HOME_POSITION) return HOME_STRETCH_MAP[color]?.[position];
  return null;
};

const computeMovePath = (fromPos, toPos, color) => {
  if (fromPos === 0) return toPos > 0 ? [toPos] : [];
  const path = [];
  let pos = fromPos;
  let guard = 0;
  while (pos !== toPos && guard < 12) {
    const next = calculateNextPosition({ position: pos, color }, 1);
    if (next == null || next === pos) break;
    path.push(next);
    pos = next;
    guard += 1;
  }
  return path;
};

const sortFinishedTokens = (list) =>
  [...list].sort((a, b) => {
    if (a.finishOrder != null && b.finishOrder != null) return a.finishOrder - b.finishOrder;
    if (a.finishedAt != null && b.finishedAt != null) return a.finishedAt - b.finishedAt;
    return a.id - b.id;
  });

const SafeStarIcon = ({ tinted }) => (
  <div className={`ludo-safe-star ${tinted ? 'ludo-safe-star--tinted' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  </div>
);

const TokenCountBadge = ({ count }) => {
  if (count < BLOCK_MIN_SIZE) return null;
  return <span className="ludo-token-count-badge">×{count}</span>;
};

const BlockadeTooltip = ({ count, visible }) => {
  if (!visible || count < BLOCK_MIN_SIZE) return null;
  return (
    <div className="ludo-blockade-tooltip" role="tooltip">
      Blockade ({count} Tokens)
    </div>
  );
};

const FinishedBadge = () => (
  <div className="ludo-finished-badges" aria-hidden="true">
    <span className="ludo-finished-crown">👑</span>
    <span className="ludo-finished-check">✓</span>
  </div>
);

const LudoPawn = ({ color, variant = 'track', glowing }) => (
  <div
    className={[
      'ludo-pawn',
      `ludo-pawn--${color.toLowerCase()}`,
      glowing ? 'ludo-pawn--glow' : '',
      variant === 'finished' ? 'ludo-pawn--finished' : '',
      variant === 'yard' ? 'ludo-pawn--yard-state' : '',
      variant === 'blockade-back' ? 'ludo-pawn--blockade-back' : '',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <div className="ludo-pawn__shadow" />
    <div className="ludo-pawn__body">
      <div className="ludo-pawn__head" />
      <div className="ludo-pawn__neck" />
      <div className="ludo-pawn__base" />
    </div>
  </div>
);

const Yard = ({ color, finishedCount = 0 }) => (
  <div className={`ludo-quadrant ${COLOR_CLASSES[color]}`}>
    <div className="ludo-home-area">
      <div className="ludo-token-slot-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ludo-token-slot">
            <div className="ludo-token-slot-inner" />
          </div>
        ))}
      </div>
      {finishedCount > 0 && (
        <div className="ludo-yard-finish-count" aria-label={`${finishedCount} tokens finished`}>
          {finishedCount}/4
        </div>
      )}
    </div>
  </div>
);

const WinProgressOverlay = ({ tokens }) => (
  <div className="ludo-win-progress" aria-hidden="true">
    {Object.values(PlayerColor).map((color) => {
      const finished = (tokens[color] || []).filter((t) => t.position === HOME_POSITION).length;
      if (!finished) return null;
      return (
        <span key={color} className={`ludo-win-progress-dot ludo-win-progress-dot--${color.toLowerCase()}`}>
          {finished}
        </span>
      );
    })}
  </div>
);

export const Board = ({ gameState, validMoves, onTokenClick, celebrationActive = false, celebrationWinnerColor }) => {
  const { tokens, currentTurn, waitingForMove } = gameState;
  const boardRef = React.useRef(null);
  const [hoveredTokenKey, setHoveredTokenKey] = React.useState(null);
  const [hoveredBlockadeKey, setHoveredBlockadeKey] = React.useState(null);

  const finishedByColor = React.useMemo(() => {
    const map = {};
    Object.entries(tokens).forEach(([color, arr]) => {
      map[color] = sortFinishedTokens((arr || []).filter((t) => t.position === HOME_POSITION));
    });
    return map;
  }, [tokens]);

  const finishedCountByColor = React.useMemo(() => {
    const map = {};
    Object.entries(finishedByColor).forEach(([color, arr]) => {
      map[color] = arr.length;
    });
    return map;
  }, [finishedByColor]);

  const activeHighlightKey = hoveredTokenKey;

  const positionMap = React.useMemo(() => {
    const map = {};
    Object.entries(tokens).forEach(([color, playerTokens]) => {
      playerTokens.forEach((t) => {
        if (t.position > 0 && t.position < HOME_POSITION) {
          const keyStr =
            t.position <= 52 ? `TRACK-${t.position}` : `HOME-${color}-${t.position}`;
          if (!map[keyStr]) map[keyStr] = [];
          map[keyStr].push({ ...t, color });
        }
      });
    });
    return map;
  }, [tokens]);

  const blockadeCells = React.useMemo(() => {
    const map = {};
    Object.entries(positionMap).forEach(([keyStr, occupants]) => {
      const byColor = {};
      occupants.forEach((t) => {
        byColor[t.color] = byColor[t.color] || [];
        byColor[t.color].push(t);
      });
      Object.entries(byColor).forEach(([color, group]) => {
        if (group.length >= BLOCK_MIN_SIZE) {
          map[`${keyStr}-${color}`] = group.sort((a, b) => a.id - b.id);
        }
      });
    });
    return map;
  }, [positionMap]);

  const blockadeHighlightCells = React.useMemo(() => {
    if (!hoveredBlockadeKey) return new Set();
    const group = blockadeCells[hoveredBlockadeKey];
    if (!group?.length) return new Set();
    const color = hoveredBlockadeKey.split('-').pop();
    const token = group[0];
    const coords =
      token.position <= 52
        ? POSITION_MAP[token.position]
        : HOME_STRETCH_MAP[color]?.[token.position];
    return coords ? new Set([coordKey(coords[0], coords[1])]) : new Set();
  }, [hoveredBlockadeKey, blockadeCells]);

  const targetHighlights = React.useMemo(() => {
    if (!waitingForMove) return new Set();
    const set = new Set();
    validMoves.forEach((move) => {
      const color = move.playerColor || currentTurn;
      const coords = getPositionCoords(move.targetPosition, color);
      if (coords) set.add(coordKey(coords[0], coords[1]));
    });
    return set;
  }, [validMoves, currentTurn, waitingForMove]);

  const pathHighlights = React.useMemo(() => {
    if (!activeHighlightKey || !waitingForMove) return new Set();
    const [color, idStr] = activeHighlightKey.split('-');
    const tokenId = Number(idStr);
    const move = validMoves.find(
      (m) => m.tokenId === tokenId && (!m.playerColor || m.playerColor === color)
    );
    if (!move) return new Set();

    const token = tokens[color]?.find((t) => t.id === tokenId);
    if (!token) return new Set();

    const path = computeMovePath(token.position, move.targetPosition, color);
    const set = new Set();
    path.forEach((pos) => {
      const coords = getPositionCoords(pos, color);
      if (coords) set.add(coordKey(coords[0], coords[1]));
    });
    return set;
  }, [activeHighlightKey, validMoves, tokens, waitingForMove]);

  const getPositionKey = (token, color) => {
    if (token.position <= 0 || token.position >= HOME_POSITION) return null;
    return token.position <= 52
      ? `TRACK-${token.position}`
      : `HOME-${color}-${token.position}`;
  };

  const getBlockadeGroup = (token, color) => {
    const key = getPositionKey(token, color);
    if (!key) return null;
    return blockadeCells[`${key}-${color}`] || null;
  };

  const getBlockadeTransform = (token, color, expanded = false) => {
    const group = getBlockadeGroup(token, color);
    if (!group) return 'none';

    const idx = group.findIndex((t) => t.id === token.id);
    const count = group.length;
    const frontIdx = count - 1;

    if (expanded) {
      if (count === 2) {
        return idx === 0
          ? 'translate(-18%, 0) scale(0.82)'
          : 'translate(18%, 0) scale(0.82)';
      }
      if (count === 3) {
        const spreads = [
          'translate(-18%, -12%) scale(0.76)',
          'translate(18%, -12%) scale(0.76)',
          'translate(0, 12%) scale(0.76)',
        ];
        return spreads[idx] || 'none';
      }
      const spreads = [
        'translate(-18%, -12%) scale(0.72)',
        'translate(18%, -12%) scale(0.72)',
        'translate(-18%, 12%) scale(0.72)',
        'translate(18%, 12%) scale(0.72)',
      ];
      return spreads[idx] || 'none';
    }

    if (count === 2) {
      if (idx === frontIdx) return 'scale(0.94)';
      return 'translate(-10%, -10%) scale(0.84)';
    }
    if (count === 3) {
      if (idx === frontIdx) return 'scale(0.9)';
      if (idx === 1) return 'translate(-8%, -10%) scale(0.8)';
      return 'translate(8%, -10%) scale(0.8)';
    }
    if (idx === frontIdx) return 'scale(0.88)';
    const offsets = [
      'translate(-12%, -10%) scale(0.74)',
      'translate(0, -10%) scale(0.74)',
      'translate(12%, -10%) scale(0.74)',
    ];
    return offsets[idx] || 'translate(0, 8%) scale(0.74)';
  };

  const getTokenOffsetTransform = (token, color) => {
    if (token.position === 0 || token.position === HOME_POSITION) {
      return 'none';
    }

    const blockadeKey = `${getPositionKey(token, color)}-${color}`;
    const expanded = hoveredBlockadeKey === blockadeKey;
    const group = getBlockadeGroup(token, color);
    if (group) return getBlockadeTransform(token, color, expanded);

    const keyStr = getPositionKey(token, color);
    const occupants = positionMap[keyStr] || [];
    if (occupants.length <= 1) return 'none';

    const idx = occupants.findIndex((t) => t.color === color && t.id === token.id);
    if (occupants.length === 2) {
      return idx === 0
        ? 'translate(-18%, 0) scale(0.85)'
        : 'translate(18%, 0) scale(0.85)';
    }
    return getBlockadeTransform(token, color, false);
  };

  const getFinishSlotIndex = (token, color) => {
    const list = finishedByColor[color] || [];
    return list.findIndex((t) => t.id === token.id);
  };

  const getTokenPos = (token) => {
    let coords = [0, 0];
    if (token.position === 0) {
      const yardByColor = YARD_COORDINATES[token.color];
      const slotIndex = Number(token.id) - 1;
      coords = yardByColor?.[slotIndex];
      if (!coords) coords = yardByColor?.[0] || [0, 0];
    } else if (token.position < 53) {
      coords = POSITION_MAP[token.position];
    } else if (token.position < HOME_POSITION) {
      coords = HOME_STRETCH_MAP[token.color][token.position];
    } else {
      const slotIndex = getFinishSlotIndex(token, token.color);
      const slots = FINISH_ZONE_COORDINATES[token.color];
      coords = slots?.[slotIndex >= 0 ? slotIndex : 0] || [7.5, 7.5];
    }

    // Yard/finish slots already use fractional cell centers (e.g. 2.5).
    // Track/home-stretch maps use integer cell indices — offset to cell center.
    const useCellCenter = token.position > 0 && token.position < HOME_POSITION;
    const row = useCellCenter ? coords[0] + 0.5 : coords[0];
    const col = useCellCenter ? coords[1] + 0.5 : coords[1];

    return {
      top: `${(row / 15) * 100}%`,
      left: `${(col / 15) * 100}%`,
    };
  };

  const renderCells = () => {
    const cells = [];
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const isYard =
          (r < 6 && c < 6) ||
          (r < 6 && c > 8) ||
          (r > 8 && c < 6) ||
          (r > 8 && c > 8);
        const isHome = r >= 6 && r <= 8 && c >= 6 && c <= 8;

        if (isYard || isHome) {
          cells.push(<div key={`${r}-${c}`} className="ludo-cell ludo-cell--void" aria-hidden="true" />);
          continue;
        }

        const isSafe = GLOBAL_SAFE_SQUARES.some((pos) => {
          const coords = POSITION_MAP[pos];
          return coords[0] === r && coords[1] === c;
        });

        let cellColorClass = '';
        if (c === 7 && r >= 1 && r <= 5) cellColorClass = 'bg-yellow';
        else if (c === 7 && r >= 9 && r <= 13) cellColorClass = 'bg-red';
        else if (r === 7 && c >= 1 && c <= 5) cellColorClass = 'bg-green';
        else if (r === 7 && c >= 9 && c <= 13) cellColorClass = 'bg-blue';
        else if (r === 13 && c === 6) cellColorClass = 'bg-red';
        else if (r === 1 && c === 8) cellColorClass = 'bg-yellow';
        else if (r === 6 && c === 1) cellColorClass = 'bg-green';
        else if (r === 8 && c === 13) cellColorClass = 'bg-blue';

        const cellKey = coordKey(r, c);
        const isTarget = targetHighlights.has(cellKey);
        const isPath = pathHighlights.has(cellKey);

        const isBlockadeCell = blockadeHighlightCells.has(cellKey);

        cells.push(
          <div
            key={cellKey}
            className={[
              'ludo-cell',
              cellColorClass,
              isSafe ? 'safe-spot' : '',
              isPath ? 'path-preview' : '',
              isTarget ? 'move-target' : '',
              isBlockadeCell ? 'blockade-highlight' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {isSafe && <SafeStarIcon tinted={Boolean(cellColorClass)} />}
          </div>
        );
      }
    }
    return cells;
  };

  const renderToken = (color, token) => {
    const tokenKey = `${color}-${token.id}`;
    const isFinished = token.position === HOME_POSITION;
    const inYard = token.position === 0;
    const inHomeStretch = token.position >= 53 && token.position < HOME_POSITION;
    const canMove =
      !isFinished &&
      waitingForMove &&
      currentTurn === color &&
      validMoves.some(
        (m) => m.tokenId === token.id && (!m.playerColor || m.playerColor === color)
      );

    const blockadeGroup = getBlockadeGroup(token, color);
    const blockadeKey = blockadeGroup ? `${getPositionKey(token, color)}-${color}` : null;
    const isBlockadeFront =
      blockadeGroup && blockadeGroup[blockadeGroup.length - 1]?.id === token.id;
    const isHovered = hoveredTokenKey === tokenKey;
    const pos = getTokenPos(token);

    const pawnVariant = isFinished
      ? 'finished'
      : blockadeGroup && !isBlockadeFront
        ? 'blockade-back'
        : inYard
          ? 'yard'
          : 'track';

    const celebrateFinished =
      isFinished && celebrationActive && token.color === celebrationWinnerColor;

    return (
      <motion.div
        key={tokenKey}
        layout={!inYard && !isFinished}
        initial={false}
        animate={{ top: pos.top, left: pos.left }}
        transition={{
          type: 'spring',
          stiffness: inYard ? 500 : 280,
          damping: inYard ? 40 : 26,
          mass: 0.85,
        }}
        onClick={() => {
          if (canMove) onTokenClick(token.id);
        }}
        onMouseEnter={() => {
          if (canMove || inYard) setHoveredTokenKey(tokenKey);
          if (blockadeKey) setHoveredBlockadeKey(blockadeKey);
        }}
        onMouseLeave={() => {
          setHoveredTokenKey((prev) => (prev === tokenKey ? null : prev));
          setHoveredBlockadeKey((prev) => (prev === blockadeKey ? null : prev));
        }}
        onFocus={() => {
          if (canMove || inYard) setHoveredTokenKey(tokenKey);
        }}
        onBlur={() => {
          setHoveredTokenKey((prev) => (prev === tokenKey ? null : prev));
        }}
        tabIndex={canMove ? 0 : -1}
        role={canMove ? 'button' : 'img'}
        aria-label={
          isFinished
            ? `${color} token ${token.id} finished`
            : inYard
              ? `${color} token ${token.id} in home base`
              : blockadeGroup
                ? `${color} blockade token ${token.id}`
                : `${color} token ${token.id}`
        }
        className={[
          'ludo-token',
          inYard ? 'ludo-token--yard' : '',
          inHomeStretch ? 'ludo-token--home-stretch' : '',
          isFinished ? 'ludo-token--finished' : '',
          celebrateFinished ? 'ludo-token--celebrate-finish' : '',
          canMove ? 'can-move' : '',
          (isHovered && canMove) || (inYard && isHovered) ? 'is-hovered' : '',
          blockadeGroup ? 'is-blockade' : '',
          isBlockadeFront ? 'is-blockade-front' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          zIndex: isBlockadeFront ? 18 : canMove ? 20 : isFinished ? 16 : 10,
        }}
      >
        <motion.div
          className="ludo-token__offset"
          style={{ transform: getTokenOffsetTransform(token, color) }}
          whileHover={
            canMove && !inYard && !isFinished
              ? { y: -5, scale: 1.05 }
              : undefined
          }
          whileTap={canMove && !inYard ? { scale: 0.95 } : undefined}
        >
        {canMove && !inYard && <span className="ludo-selection-ring" aria-hidden="true" />}
        {inYard && (isHovered || canMove) && (
          <span
            className={`ludo-yard-glow-ring ${canMove ? 'ludo-yard-glow-ring--selectable' : ''}`}
            aria-hidden="true"
          />
        )}
        <LudoPawn
          color={color}
          variant={pawnVariant}
          glowing={canMove && !inYard}
        />
        {isBlockadeFront && (
          <TokenCountBadge count={blockadeGroup.length} />
        )}
        {blockadeGroup && isBlockadeFront && (
          <BlockadeTooltip
            count={blockadeGroup.length}
            visible={hoveredBlockadeKey === blockadeKey}
          />
        )}
        {isFinished && <FinishedBadge />}
        </motion.div>
      </motion.div>
    );
  };

  return (
    <div
      className={[
        'ludo-board-outer',
        celebrationActive ? 'ludo-board-outer--celebrate' : '',
        celebrationWinnerColor
          ? `ludo-board-outer--aura-${String(celebrationWinnerColor).toLowerCase()}`
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div ref={boardRef} className="ludo-board">
        <div className="ludo-board-inner">
          <div className="ludo-grid-base">{renderCells()}</div>

          <div className="ludo-corner-yard top-left">
            <Yard color={PlayerColor.GREEN} finishedCount={finishedCountByColor.GREEN || 0} />
          </div>
          <div className="ludo-corner-yard top-right">
            <Yard color={PlayerColor.YELLOW} finishedCount={finishedCountByColor.YELLOW || 0} />
          </div>
          <div className="ludo-corner-yard bottom-left">
            <Yard color={PlayerColor.RED} finishedCount={finishedCountByColor.RED || 0} />
          </div>
          <div className="ludo-corner-yard bottom-right">
            <Yard color={PlayerColor.BLUE} finishedCount={finishedCountByColor.BLUE || 0} />
          </div>

          <div className="ludo-center-star">
            <div className="ludo-center-star-inner">
              <div className="star-triangle red" />
              <div className="star-triangle yellow" />
              <div className="star-triangle green" />
              <div className="star-triangle blue" />
              <div className="ludo-center-shine" />
              <WinProgressOverlay tokens={tokens} />
            </div>
          </div>

          <AnimatePresence>
            {Object.entries(tokens).map(([color, playerTokens]) =>
              playerTokens.map((token) => renderToken(color, token))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
