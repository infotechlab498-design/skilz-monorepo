/**
 * @typedef {{ coins: number, xp: number }} OutcomeReward
 *
 * @typedef {{
 *   schemaVersion: number,
 *   updatedAt: string | import('firebase-admin/firestore').Timestamp | null,
 *   updatedBy: string | null,
 *   global: { defaultEntryFee: number, maintenanceMode: boolean },
 *   games: Record<string, Record<string, unknown>>,
 * }} GameEconomyConfig
 */

export {};
