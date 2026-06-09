import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import { generateQuestionBatch, persistQuestionBatch } from '../../src/services/enigmaPulse/aiBatchGenerator.js';

async function main() {
  const category = process.env.EP_BATCH_CATEGORY || 'General Knowledge';
  const difficulty = process.env.EP_BATCH_DIFFICULTY || 'medium';
  const count = Number(process.env.EP_BATCH_COUNT || 60);

  const generated = await generateQuestionBatch({ category, difficulty, count });
  const result = await persistQuestionBatch(generated, { category, difficulty });
  console.log(`[EnigmaPulse] generated=${generated.length} saved=${result.saved}`);
}

main().catch((err) => {
  console.error('[EnigmaPulse] batch generation failed:', err?.message || err);
  process.exit(1);
});
