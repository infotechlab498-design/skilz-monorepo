import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_GAME_KEYS, DEFAULT_ENTRY_FEE_COINS, GAME_KEYS } from '../../../shared/gameConfig/constants.js';
import {
  buildDefaultGameEconomyConfig,
  mergeGameEconomyWithDefaults,
  toPublicGameEconomyConfig,
} from '../../../shared/gameConfig/defaults.js';
import {
  getEntryFeeFromConfig,
  validateAndNormalizeGameEconomyConfig,
} from '../../../shared/gameConfig/validate.js';

describe('buildDefaultGameEconomyConfig', () => {
  it('sets entryFee 10 for every game', () => {
    const config = buildDefaultGameEconomyConfig();
    for (const key of ALL_GAME_KEYS) {
      assert.equal(config.games[key].entryFee, DEFAULT_ENTRY_FEE_COINS, key);
      assert.equal(config.games[key].enabled, true, `${key} enabled`);
    }
    assert.equal(config.global.defaultEntryFee, DEFAULT_ENTRY_FEE_COINS);
  });

  it('includes trivia and enigma_pulse reward blocks', () => {
    const config = buildDefaultGameEconomyConfig();
    assert.equal(config.games[GAME_KEYS.TRIVIA].questionCount, 20);
    assert.equal(config.games[GAME_KEYS.ENIGMA_PULSE].modes.pattern_recognition.sharedRounds, 20);
  });
});

describe('mergeGameEconomyWithDefaults', () => {
  it('preserves defaults for missing games', () => {
    const merged = mergeGameEconomyWithDefaults({
      games: {
        trivia: { entryFee: 25 },
      },
    });
    assert.equal(merged.games.trivia.entryFee, 25);
    assert.equal(merged.games.ludo.entryFee, DEFAULT_ENTRY_FEE_COINS);
  });
});

describe('validateAndNormalizeGameEconomyConfig', () => {
  it('rejects negative entry fee', () => {
    const base = buildDefaultGameEconomyConfig();
    base.games.trivia.entryFee = -1;
    assert.throws(() => validateAndNormalizeGameEconomyConfig(base), /entryFee/);
  });

  it('rejects disabling all games', () => {
    const base = buildDefaultGameEconomyConfig();
    for (const key of ALL_GAME_KEYS) {
      base.games[key].enabled = false;
    }
    assert.throws(() => validateAndNormalizeGameEconomyConfig(base), /At least one game/);
  });
});

import {
  getEntryFeeForVariant,
  normalizeEnigmaModeKey,
  normalizeTriviaCategoryKey,
  resolveEnigmaModeVariant,
  resolveTriviaVariant,
} from '../../../shared/gameConfig/resolve.js';

describe('resolveTriviaVariant', () => {
  it('inherits parent and applies category override entry fee', () => {
    const config = buildDefaultGameEconomyConfig();
    config.games.trivia.entryFee = 10;
    config.games.trivia.categories.current_affairs = { entryFee: 20, questionCount: 15 };

    const history = resolveTriviaVariant(config, 'history');
    const affairs = resolveTriviaVariant(config, 'current_affairs');

    assert.equal(history.entryFee, 10);
    assert.equal(history.questionCount, 20);
    assert.equal(affairs.entryFee, 20);
    assert.equal(affairs.questionCount, 15);
  });

  it('normalizes category aliases', () => {
    assert.equal(normalizeTriviaCategoryKey('Current Affairs'), 'current_affairs');
    assert.equal(normalizeTriviaCategoryKey('history'), 'history');
  });
});

describe('resolveEnigmaModeVariant', () => {
  it('applies per-mode entry fee override', () => {
    const config = buildDefaultGameEconomyConfig();
    config.games.enigma_pulse.entryFee = 10;
    config.games.enigma_pulse.modes.word_cipher.entryFee = 25;

    const pattern = resolveEnigmaModeVariant(config, 'pattern_recognition');
    const cipher = resolveEnigmaModeVariant(config, 'word_cipher');

    assert.equal(pattern.entryFee, 10);
    assert.equal(cipher.entryFee, 25);
  });

  it('normalizes legacy game keys', () => {
    assert.equal(normalizeEnigmaModeKey('riddle_classic'), 'word_cipher');
    assert.equal(normalizeEnigmaModeKey('pattern_recognition'), 'pattern_recognition');
  });
});

describe('getEntryFeeForVariant', () => {
  it('returns category-specific trivia fee', () => {
    const config = buildDefaultGameEconomyConfig();
    config.games.trivia.categories.history = { entryFee: 12 };
    assert.equal(getEntryFeeForVariant(config, GAME_KEYS.TRIVIA, 'history'), 12);
    assert.equal(getEntryFeeForVariant(config, GAME_KEYS.TRIVIA, 'current_affairs'), 10);
  });
});

describe('getEntryFeeFromConfig', () => {
  it('returns 10 for all canonical game keys', () => {
    const config = buildDefaultGameEconomyConfig();
    for (const key of ALL_GAME_KEYS) {
      assert.equal(getEntryFeeFromConfig(config, key), 10);
    }
    assert.equal(getEntryFeeFromConfig(config, 'mathRush'), 10);
    assert.equal(getEntryFeeFromConfig(config, 'enigmaPulse'), 10);
  });

  it('respects admin override with variant key', () => {
    const config = buildDefaultGameEconomyConfig();
    config.games.trivia.categories.current_affairs = { entryFee: 18 };
    assert.equal(getEntryFeeFromConfig(config, 'trivia', 'current_affairs'), 18);
  });
});

describe('toPublicGameEconomyConfig', () => {
  it('exposes entryFee per game without reward internals', () => {
    const pub = toPublicGameEconomyConfig(buildDefaultGameEconomyConfig());
    assert.equal(pub.games.trivia.entryFee, 10);
    assert.equal(pub.games.neurochain.entryFee, 10);
    assert.ok(!('rewards' in pub.games.trivia));
  });
});
