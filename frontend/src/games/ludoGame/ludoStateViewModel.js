import { PlayerType, PlayerColor } from './types';

/**
 * Derived view-model: ordered player rows for UI/API docs without changing the engine’s color-keyed map.
 *
 * @param {object} state — Ludo reducer / wire state (`players` keyed by RED|BLUE|YELLOW|GREEN)
 * @returns {Array<{ color: string, id: string | undefined, name: string, type: string, coins?: number, xp?: number }>}
 */
export function buildPlayerListFromLudoState(state) {
  if (!state?.players || typeof state.players !== 'object') return [];
  const order = [
    PlayerColor.RED,
    PlayerColor.BLUE,
    PlayerColor.YELLOW,
    PlayerColor.GREEN,
  ];
  const out = [];
  for (const color of order) {
    const p = state.players[color];
    if (!p || p.type === PlayerType.EMPTY) continue;
    out.push({
      color,
      id: p.id,
      name: p.name || color,
      type: p.type,
      coins: p.coins,
      xp: p.xp,
    });
  }
  return out;
}
