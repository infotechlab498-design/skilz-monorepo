import copy from '@truthpack/copy.json';
import {
  EP_INSUFFICIENT_QUESTIONS,
  EP_SYLLOGISM_DECK_INCOMPLETE,
  EP_WORD_CIPHER_DECK_INCOMPLETE,
} from '../../../../shared/enigmaPulse/errorCodes.js';

/**
 * Toast / banner text for `ep_error`, preferring truthpack copy when `code` matches.
 * @param {{ message?: string; code?: string }} payload
 */
export function resolveEnigmaPulseErrorToast(payload) {
  const errors = copy?.games?.enigmaPulse?.errors;
  const code = String(payload?.code || '').trim();
  const fallbackMsg = String(payload?.message || '').trim();
  if (code === EP_INSUFFICIENT_QUESTIONS) {
    if (errors?.insufficientQuestions) return String(errors.insufficientQuestions).trim();
    if (fallbackMsg) return fallbackMsg;
  }
  if (code === EP_SYLLOGISM_DECK_INCOMPLETE) {
    if (errors?.syllogismDeckIncomplete) return String(errors.syllogismDeckIncomplete).trim();
    if (fallbackMsg) return fallbackMsg;
  }
  if (code === EP_WORD_CIPHER_DECK_INCOMPLETE) {
    if (errors?.wordCipherDeckIncomplete) return String(errors.wordCipherDeckIncomplete).trim();
    if (fallbackMsg) return fallbackMsg;
  }
  return fallbackMsg || 'Something went wrong.';
}
