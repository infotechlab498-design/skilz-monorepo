/**
 * EnigmaPulse lobby games: each `key` is the socket `gameKey`. Question rows are isolated per mode
 * (`rowMatchesEnigmaGameKey`). Pattern Recognition uses lobby key `pattern_recognition`; Firestore `questions.type`
 * stays `riddle_sequence` (or legacy `sequence`) — see `shared/enigmaPulse/gameKeys.js`.
 */

export const ENIGMA_GAME_OPTIONS = [
  {
    key: 'pattern_recognition',
    title: 'Pattern Recognition',
    subtitle: 'Recognize patterns and sequences',
    type: 'PatternRecognition',
    accent: 'purple',
  },
  {
    key: 'word_cipher',
    title: 'Word Cipher',
    subtitle: 'Decode and solve riddle prompts',
    type: 'WordCipher',
    accent: 'blue',
  },
  {
    key: 'syllogism',
    title: 'Syllogism',
    subtitle: 'Solve syllogistic reasoning problems',
    type: 'Syllogism',
    accent: 'amber',
  },
];

export const ENIGMA_PLAY_MODES = [
  { key: 'practice', label: 'Practice' },
  { key: 'one_vs_one', label: '1 vs 1' },
  { key: 'invite', label: 'Invite Friend' },
];
