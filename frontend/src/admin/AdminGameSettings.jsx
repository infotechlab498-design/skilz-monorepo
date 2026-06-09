import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  ALL_GAME_KEYS,
  ENIGMA_MODE_LABELS,
  GAME_KEYS,
  TRIVIA_CATEGORY_LABELS,
} from '../../../shared/gameConfig/constants.js';
import {
  resolveEnigmaModeVariant,
  resolveTriviaVariant,
} from '../../../shared/gameConfig/resolve.js';
import '../styles/adminBlogs.css';
import '../styles/adminGameSettings.css';

const GAME_TABS = [
  { key: GAME_KEYS.TRIVIA, label: 'Trivia' },
  { key: GAME_KEYS.MATH_RUSH, label: 'MathRush' },
  { key: GAME_KEYS.LUDO, label: 'Ludo' },
  { key: GAME_KEYS.ENIGMA_PULSE, label: 'EnigmaPulse' },
  { key: GAME_KEYS.NEUROCHAIN, label: 'NeuroChain' },
  { key: GAME_KEYS.COGNITIVE, label: 'Cognitive' },
];

const VARIANT_FILTERS = {
  [GAME_KEYS.TRIVIA]: [
    { key: '', label: 'All categories (defaults)' },
    { key: 'history', label: TRIVIA_CATEGORY_LABELS.history },
    { key: 'current_affairs', label: TRIVIA_CATEGORY_LABELS.current_affairs },
  ],
  [GAME_KEYS.ENIGMA_PULSE]: [
    { key: '', label: 'All modes (defaults)' },
    { key: 'pattern_recognition', label: ENIGMA_MODE_LABELS.pattern_recognition },
    { key: 'word_cipher', label: ENIGMA_MODE_LABELS.word_cipher },
    { key: 'syllogism', label: ENIGMA_MODE_LABELS.syllogism },
  ],
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
}

function NumberInput({ label, value, onChange, min = 0, max = 100000, hint }) {
  return (
    <label className="agsField">
      <span className="agsFieldLabel">{label}</span>
      <input
        type="number"
        className="agsFieldInput"
        min={min}
        max={max}
        value={Number.isFinite(Number(value)) ? Number(value) : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint ? <span className="agsFieldHint">{hint}</span> : null}
    </label>
  );
}

function RewardBlock({ title, rewards, onChange }) {
  const r = rewards || { win: {}, lose: {}, draw: {} };
  const patch = (outcome, field, val) => {
    onChange({
      ...r,
      [outcome]: { ...(r[outcome] || {}), [field]: val },
    });
  };
  return (
    <fieldset className="agsRewardBlock">
      <legend>{title}</legend>
      {(['win', 'lose', 'draw']).map((outcome) => (
        <div key={outcome} className="agsRewardRow">
          <span className="agsRewardOutcome">{outcome}</span>
          <NumberInput
            label="Coins"
            value={r[outcome]?.coins ?? 0}
            onChange={(v) => patch(outcome, 'coins', v)}
            max={1000}
          />
          <NumberInput
            label="XP"
            value={r[outcome]?.xp ?? 0}
            onChange={(v) => patch(outcome, 'xp', v)}
            max={500}
          />
        </div>
      ))}
    </fieldset>
  );
}

function PreviewCard({ slice, globalDefault, variantLabel }) {
  const fee = Number(slice?.entryFee ?? globalDefault ?? 10);
  const win = slice?.rewards?.win || {};
  return (
    <div className="agsPreview">
      <h4>Live preview (new matches){variantLabel ? ` — ${variantLabel}` : ''}</h4>
      <p>
        Entry: <strong>{fee} coins</strong>
        {!slice?.enabled ? ' · disabled' : ''}
      </p>
      <p>
        Win payout: <strong>+{Number(win.coins || 0)} coins</strong>,{' '}
        <strong>+{Number(win.xp || 0)} XP</strong> (+ performance bonuses if enabled)
      </p>
      <p className="agsPreviewNote">Changes apply to new matches after save. In-progress games keep their snapshot.</p>
    </div>
  );
}

function SubVariantFilter({ options, value, onChange }) {
  if (!options?.length) return null;
  return (
    <div className="agsSubFilter" role="tablist" aria-label="Sub-game filter">
      {options.map((opt) => (
        <button
          key={opt.key || '__default'}
          type="button"
          role="tab"
          aria-selected={value === opt.key}
          className={`agsSubFilterBtn ${value === opt.key ? 'is-active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function EnigmaModePanel({ modeKey, mode, onChange }) {
  if (!mode) return null;
  return (
    <details className="agsModePanel" open={modeKey === 'pattern_recognition'}>
      <summary>{ENIGMA_MODE_LABELS[modeKey] || modeKey.replace(/_/g, ' ')}</summary>
      <div className="agsModeBody">
        <label className="agsToggle">
          <input
            type="checkbox"
            checked={mode.enabled !== false}
            onChange={(e) => onChange({ ...mode, enabled: e.target.checked })}
          />
          <span>Mode enabled</span>
        </label>
        <NumberInput
          label="Entry fee (coins)"
          value={mode.entryFee ?? 10}
          onChange={(v) => onChange({ ...mode, entryFee: v })}
          max={10000}
        />
        {mode.questionsPerPlayer != null ? (
          <NumberInput
            label="Questions per player"
            value={mode.questionsPerPlayer}
            onChange={(v) => onChange({ ...mode, questionsPerPlayer: v })}
            max={30}
          />
        ) : null}
        {mode.sharedRounds != null ? (
          <NumberInput
            label="Shared rounds"
            value={mode.sharedRounds}
            onChange={(v) => onChange({ ...mode, sharedRounds: v })}
            max={40}
          />
        ) : null}
        {mode.questionCount != null ? (
          <NumberInput
            label="Question count"
            value={mode.questionCount}
            onChange={(v) => onChange({ ...mode, questionCount: v })}
            max={30}
          />
        ) : null}
        <NumberInput
          label="Seconds per question"
          value={mode.questionSeconds ?? 15}
          onChange={(v) => onChange({ ...mode, questionSeconds: v })}
          max={120}
        />
        <NumberInput
          label="Matchmaking timeout (ms)"
          value={mode.matchmakingTimeoutMs ?? 12000}
          onChange={(v) => onChange({ ...mode, matchmakingTimeoutMs: v })}
          max={120000}
        />
        {mode.rewards ? (
          <RewardBlock
            title="Mode rewards"
            rewards={mode.rewards}
            onChange={(rewards) => onChange({ ...mode, rewards })}
          />
        ) : null}
      </div>
    </details>
  );
}

function GameForm({ gameKey, slice, global, onChange, variantKey = '' }) {
  if (!slice) return <p className="adminBlogsV2Sub">No config for this game.</p>;

  const isVariantMode = Boolean(variantKey);
  const variantLabel = useMemo(() => {
    if (!variantKey) return '';
    if (gameKey === GAME_KEYS.TRIVIA) return TRIVIA_CATEGORY_LABELS[variantKey] || variantKey;
    if (gameKey === GAME_KEYS.ENIGMA_PULSE) return ENIGMA_MODE_LABELS[variantKey] || variantKey;
    return variantKey;
  }, [gameKey, variantKey]);

  const resolvedSlice = useMemo(() => {
    if (!isVariantMode) return slice;
    if (gameKey === GAME_KEYS.TRIVIA) {
      return resolveTriviaVariant({ games: { [GAME_KEYS.TRIVIA]: slice } }, variantKey);
    }
    if (gameKey === GAME_KEYS.ENIGMA_PULSE) {
      return resolveEnigmaModeVariant({ games: { [GAME_KEYS.ENIGMA_PULSE]: slice } }, variantKey);
    }
    return slice;
  }, [gameKey, slice, variantKey, isVariantMode]);

  const variantOverride = useMemo(() => {
    if (!isVariantMode) return null;
    if (gameKey === GAME_KEYS.TRIVIA) return slice.categories?.[variantKey] || {};
    if (gameKey === GAME_KEYS.ENIGMA_PULSE) return slice.modes?.[variantKey] || {};
    return {};
  }, [gameKey, slice, variantKey, isVariantMode]);

  const patchParent = (partial) => onChange({ ...slice, ...partial });
  const patchVariant = (partial) => {
    if (gameKey === GAME_KEYS.TRIVIA) {
      onChange({
        ...slice,
        categories: {
          ...(slice.categories || {}),
          [variantKey]: { ...(slice.categories?.[variantKey] || {}), ...partial },
        },
      });
      return;
    }
    if (gameKey === GAME_KEYS.ENIGMA_PULSE) {
      onChange({
        ...slice,
        modes: {
          ...(slice.modes || {}),
          [variantKey]: { ...(slice.modes?.[variantKey] || {}), ...partial },
        },
      });
    }
  };

  const patch = isVariantMode ? patchVariant : patchParent;
  const patchDefaults = (partial) =>
    patchParent({ defaults: { ...(slice.defaults || {}), ...partial } });
  const editing = isVariantMode ? { ...resolvedSlice, ...variantOverride } : slice;

  return (
    <div className="agsGameForm">
      {isVariantMode ? (
        <p className="agsVariantBanner">
          Editing overrides for <strong>{variantLabel}</strong>. Unset fields inherit game defaults.
        </p>
      ) : null}

      <PreviewCard slice={resolvedSlice} globalDefault={global?.defaultEntryFee} variantLabel={variantLabel} />

      <div className="agsToggleRow">
        <label className="agsToggle">
          <input
            type="checkbox"
            checked={Boolean(editing.enabled)}
            onChange={(e) => patch({ enabled: e.target.checked })}
          />
          <span>{isVariantMode ? `${variantLabel} enabled` : 'Game enabled'}</span>
        </label>
      </div>

      <div className="agsGrid2">
        <NumberInput
          label="Entry fee (coins)"
          value={editing.entryFee ?? slice.entryFee ?? global?.defaultEntryFee ?? 10}
          onChange={(v) => patch({ entryFee: v })}
          max={10000}
          hint="Deducted when a player joins or starts a match."
        />
      </div>

      {(isVariantMode ? editing.rewards || slice.rewards : slice.rewards) ? (
        <RewardBlock
          title={isVariantMode ? `${variantLabel} rewards` : 'Match rewards'}
          rewards={editing.rewards || slice.rewards}
          onChange={(rewards) => patch({ rewards })}
        />
      ) : null}

      {gameKey === GAME_KEYS.TRIVIA && !isVariantMode ? (
        <>
          <div className="agsGrid3">
            <NumberInput label="Questions per match" value={slice.questionCount} onChange={(v) => patch({ questionCount: v })} max={50} />
            <NumberInput label="Seconds per question" value={slice.questionSeconds} onChange={(v) => patch({ questionSeconds: v })} max={120} />
            <NumberInput label="Matchmaking timeout (ms)" value={slice.matchmakingTimeoutMs} onChange={(v) => patch({ matchmakingTimeoutMs: v })} max={120000} />
          </div>
          {slice.performanceBonuses ? (
            <div className="agsGrid3">
              <label className="agsToggle">
                <input
                  type="checkbox"
                  checked={Boolean(slice.performanceBonuses.enabled)}
                  onChange={(e) =>
                    patch({
                      performanceBonuses: { ...slice.performanceBonuses, enabled: e.target.checked },
                    })
                  }
                />
                <span>Performance bonuses</span>
              </label>
              <NumberInput
                label="Max bonus coins"
                value={slice.performanceBonuses.maxBonusCoins}
                onChange={(v) =>
                  patch({ performanceBonuses: { ...slice.performanceBonuses, maxBonusCoins: v } })
                }
                max={100}
              />
              <NumberInput
                label="Max bonus XP"
                value={slice.performanceBonuses.maxBonusXp}
                onChange={(v) =>
                  patch({ performanceBonuses: { ...slice.performanceBonuses, maxBonusXp: v } })
                }
                max={100}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {gameKey === GAME_KEYS.TRIVIA && isVariantMode ? (
        <div className="agsGrid3">
          <NumberInput label="Questions per match" value={editing.questionCount ?? slice.questionCount} onChange={(v) => patch({ questionCount: v })} max={50} />
          <NumberInput label="Seconds per question" value={editing.questionSeconds ?? slice.questionSeconds} onChange={(v) => patch({ questionSeconds: v })} max={120} />
          <NumberInput label="Matchmaking timeout (ms)" value={editing.matchmakingTimeoutMs ?? slice.matchmakingTimeoutMs} onChange={(v) => patch({ matchmakingTimeoutMs: v })} max={120000} />
        </div>
      ) : null}

      {gameKey === GAME_KEYS.MATH_RUSH ? (
        <div className="agsGrid3">
          <NumberInput label="Max rounds" value={slice.maxRounds} onChange={(v) => patch({ maxRounds: v })} max={30} />
          <NumberInput label="Turn seconds" value={slice.turnSeconds} onChange={(v) => patch({ turnSeconds: v })} max={120} />
          <NumberInput label="Bot match delay (ms)" value={slice.botMatchDelayMs} onChange={(v) => patch({ botMatchDelayMs: v })} max={120000} />
        </div>
      ) : null}

      {gameKey === GAME_KEYS.LUDO ? (
        <div className="agsGrid3">
          <NumberInput label="Turn timer (sec)" value={slice.turnTimerSec} onChange={(v) => patch({ turnTimerSec: v })} max={120} />
          <NumberInput label="Queue wait window (ms)" value={slice.waitWindowMs} onChange={(v) => patch({ waitWindowMs: v })} max={120000} />
          <NumberInput label="Max players" value={slice.maxPlayers} onChange={(v) => patch({ maxPlayers: v })} min={2} max={4} />
          <NumberInput
            label="Rank 1 prize multiplier"
            value={slice.prizeMultipliers?.rank1 ?? 2}
            onChange={(v) => patch({ prizeMultipliers: { ...(slice.prizeMultipliers || {}), rank1: v } })}
            max={10}
          />
          <NumberInput
            label="Rank 2 prize multiplier"
            value={slice.prizeMultipliers?.rank2 ?? 1.5}
            onChange={(v) => patch({ prizeMultipliers: { ...(slice.prizeMultipliers || {}), rank2: v } })}
            max={10}
          />
          <NumberInput label="Rank 1 XP" value={slice.rankXp?.rank1 ?? 100} onChange={(v) => patch({ rankXp: { ...(slice.rankXp || {}), rank1: v } })} max={500} />
        </div>
      ) : null}

      {gameKey === GAME_KEYS.ENIGMA_PULSE && slice.defaults && !isVariantMode ? (
        <>
          <div className="agsGrid3">
            <NumberInput label="Default question count" value={slice.defaults.questionCount} onChange={(v) => patchDefaults({ questionCount: v })} max={30} />
            <NumberInput label="Question seconds" value={slice.defaults.questionSeconds} onChange={(v) => patchDefaults({ questionSeconds: v })} max={120} />
            <NumberInput label="Matchmaking timeout (ms)" value={slice.defaults.matchmakingTimeoutMs} onChange={(v) => patchDefaults({ matchmakingTimeoutMs: v })} max={60000} />
          </div>
          {slice.performanceBonuses ? (
            <div className="agsGrid2">
              <NumberInput
                label="Max bonus coins"
                value={slice.performanceBonuses.maxBonusCoins}
                onChange={(v) =>
                  patchParent({ performanceBonuses: { ...slice.performanceBonuses, maxBonusCoins: v } })
                }
                max={100}
              />
              <NumberInput
                label="Max bonus XP"
                value={slice.performanceBonuses.maxBonusXp}
                onChange={(v) =>
                  patchParent({ performanceBonuses: { ...slice.performanceBonuses, maxBonusXp: v } })
                }
                max={100}
              />
            </div>
          ) : null}
          <p className="agsFieldHint">Use the sub-game filter above to configure Pattern Recognition, Word Cipher, or Syllogism individually.</p>
        </>
      ) : null}

      {gameKey === GAME_KEYS.ENIGMA_PULSE && isVariantMode ? (
        <EnigmaModePanel
          modeKey={variantKey}
          mode={slice.modes?.[variantKey] || {}}
          onChange={(next) => patchVariant(next)}
        />
      ) : null}

      {gameKey === GAME_KEYS.NEUROCHAIN ? (
        <div className="agsGrid3">
          <NumberInput label="Nodes per match" value={slice.nodesPerMatch} onChange={(v) => patch({ nodesPerMatch: v })} max={20} />
          <NumberInput label="Question ms" value={slice.questionMs} onChange={(v) => patch({ questionMs: v })} max={120000} />
          <NumberInput label="Match window (ms)" value={slice.matchWindowMs} onChange={(v) => patch({ matchWindowMs: v })} max={120000} />
        </div>
      ) : null}

      {gameKey === GAME_KEYS.COGNITIVE ? (
        <div className="agsGrid3">
          <NumberInput label="Max rounds" value={slice.maxRounds} onChange={(v) => patch({ maxRounds: v })} max={30} />
          <NumberInput label="Round ms" value={slice.roundMs} onChange={(v) => patch({ roundMs: v })} max={120000} />
          <NumberInput label="Match window (ms)" value={slice.matchWindowMs} onChange={(v) => patch({ matchWindowMs: v })} max={120000} />
        </div>
      ) : null}
    </div>
  );
}

export default function AdminGameSettings({ onNotify }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [config, setConfig] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [activeGame, setActiveGame] = useState(GAME_KEYS.TRIVIA);
  const [activeVariant, setActiveVariant] = useState('');
  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  const notify = useCallback(
    (msg, isError = false) => {
      if (onNotify) onNotify(msg);
      else if (isError) console.error(msg);
      else console.log(msg);
    },
    [onNotify]
  );

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAdminGameConfig();
      const next = res?.config ?? null;
      setConfig(cloneConfig(next));
      setSavedSnapshot(cloneConfig(next));
    } catch (e) {
      notify(e?.message || 'Failed to load game settings', true);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await api.getAdminGameConfigAudit(15);
      setAudit(Array.isArray(res?.entries) ? res.entries : []);
    } catch {
      setAudit([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadAudit();
  }, [loadConfig, loadAudit]);

  useEffect(() => {
    setActiveVariant('');
  }, [activeGame]);

  const dirty = useMemo(
    () => JSON.stringify(config) !== JSON.stringify(savedSnapshot),
    [config, savedSnapshot]
  );

  const activeSlice = config?.games?.[activeGame];

  const patchActiveGame = useCallback(
    (nextSlice) => {
      setConfig((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          games: { ...prev.games, [activeGame]: nextSlice },
        };
      });
    },
    [activeGame]
  );

  const patchGlobal = useCallback((partial) => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, global: { ...(prev.global || {}), ...partial } };
    });
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await api.updateAdminGameConfig(config);
      const next = res?.config ?? config;
      setConfig(cloneConfig(next));
      setSavedSnapshot(cloneConfig(next));
      notify('Game settings saved.');
      loadAudit();
    } catch (e) {
      notify(e?.message || 'Save failed', true);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(cloneConfig(savedSnapshot));
    notify('Discarded unsaved changes.');
  };

  const handleSeed = async () => {
    if (!window.confirm('Seed defaults from code? Existing document is kept unless you force overwrite in API.')) {
      return;
    }
    setSeeding(true);
    try {
      const res = await api.seedAdminGameConfig({ force: false });
      if (res?.seeded) {
        notify('Default game economy seeded.');
        await loadConfig();
        loadAudit();
      } else {
        notify('Config already exists — loaded current document.');
        await loadConfig();
      }
    } catch (e) {
      notify(e?.message || 'Seed failed', true);
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="adminBlogsV2">
        <p className="adminBlogsV2Sub">Loading game settings…</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="adminBlogsV2">
        <p className="adminBlogsV2Sub">Could not load game settings.</p>
        <button type="button" className="adminBlogsV2Primary" onClick={loadConfig}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="adminBlogsV2 agsRoot">
      <div className="adminBlogsV2Top">
        <div>
          <h2 className="adminBlogsV2Title" style={{ fontSize: '28px' }}>
            Game Settings
          </h2>
          <p className="adminBlogsV2Sub">
            Entry fees, rewards, timers, and match rules — synced to Firestore for all games.
          </p>
          <p className="agsMeta">
            Last updated: {formatWhen(config.updatedAt)} · by {config.updatedBy || '—'}
          </p>
        </div>
        <div className="agsActions">
          <button type="button" className="adminBlogsV2Ghost" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Seeding…' : 'Seed defaults'}
          </button>
          <button type="button" className="adminBlogsV2Ghost" onClick={handleReset} disabled={!dirty || saving}>
            Discard
          </button>
          <button type="button" className="adminBlogsV2Primary" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <section className="agsGlobalCard">
        <h3>Global</h3>
        <div className="agsGrid2">
          <NumberInput
            label="Default entry fee (coins)"
            value={config.global?.defaultEntryFee ?? 10}
            onChange={(v) => patchGlobal({ defaultEntryFee: v })}
            max={10000}
          />
          <label className="agsToggle agsToggleInline">
            <input
              type="checkbox"
              checked={Boolean(config.global?.maintenanceMode)}
              onChange={(e) => patchGlobal({ maintenanceMode: e.target.checked })}
            />
            <span>Maintenance mode (lobbies should respect this when wired)</span>
          </label>
        </div>
      </section>

      <div className="agsTabs" role="tablist" aria-label="Games">
        {GAME_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeGame === tab.key}
            className={`agsTab ${activeGame === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveGame(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SubVariantFilter
        options={VARIANT_FILTERS[activeGame]}
        value={activeVariant}
        onChange={setActiveVariant}
      />

      <section className="agsPanel" role="tabpanel">
        <GameForm
          gameKey={activeGame}
          slice={activeSlice}
          global={config.global}
          onChange={patchActiveGame}
          variantKey={activeVariant}
        />
      </section>

      <section className="agsAudit">
        <div className="agsAuditHead">
          <h3>Recent changes</h3>
          <button type="button" className="adminBlogsV2Ghost" onClick={loadAudit} disabled={auditLoading}>
            Refresh
          </button>
        </div>
        {auditLoading ? (
          <p className="adminBlogsV2Sub">Loading audit…</p>
        ) : audit.length === 0 ? (
          <p className="adminBlogsV2Sub">No audit entries yet.</p>
        ) : (
          <ul className="agsAuditList">
            {audit.map((row) => (
              <li key={row.id}>
                <strong>{row.action || 'update'}</strong>
                {row.gameKey ? ` · ${row.gameKey}` : ''} · {formatWhen(row.at)} · {row.adminUid || 'admin'}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export { ALL_GAME_KEYS, GAME_TABS };
