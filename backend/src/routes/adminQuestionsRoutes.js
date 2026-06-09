import express from 'express';
import * as questionAdmin from '../services/firestoreQuestionAdmin.js';
import { parseSingleQuestionsCsv } from '../middleware/uploadCsvMiddleware.js';
import { parseSingleQuestionsXlsx } from '../middleware/uploadXlsxMiddleware.js';

const router = express.Router();

router.get('/stats', async (_req, res, next) => {
  try {
    const data = await questionAdmin.getQuestionStats();
    res.json({ success: true, ...data });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { q, category, difficulty, active, limit, cursor, gameType, type } = req.query;
    let activeParsed;
    if (active === 'true') activeParsed = true;
    else if (active === 'false') activeParsed = false;
    else activeParsed = undefined;

    const result = await questionAdmin.listQuestions({
      q,
      category,
      difficulty,
      active: activeParsed,
      gameType,
      type,
      limit: limit != null ? Number(limit) : undefined,
      cursor,
    });
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const uid = String(req.userId || '').trim();
    const q = await questionAdmin.createQuestion(req.body || {}, uid);
    res.status(201).json({ success: true, question: q });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const q = await questionAdmin.getQuestion(req.params.id);
    res.json({ success: true, question: q });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const uid = String(req.userId || '').trim();
    const q = await questionAdmin.updateQuestion(req.params.id, req.body || {}, uid);
    res.json({ success: true, question: q });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const out = await questionAdmin.deleteQuestion(req.params.id);
    res.json({ success: true, ...out });
  } catch (e) {
    next(e);
  }
});

router.post('/bulk-json', express.json({ limit: '2mb' }), async (req, res, next) => {
  try {
    const uid = String(req.userId || '').trim();
    const rows = req.body?.rows;
    if (!Array.isArray(rows)) {
      res.status(400).json({ success: false, error: 'rows array is required' });
      return;
    }
    const result = await questionAdmin.bulkInsertQuestions(rows, uid);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.post('/bulk-csv', parseSingleQuestionsCsv, async (req, res, next) => {
  try {
    const uid = String(req.userId || '').trim();
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: 'CSV file is required (field name: file)' });
      return;
    }
    const rows = questionAdmin.parseQuestionsCsv(file.buffer);
    const result = await questionAdmin.bulkInsertQuestions(rows, uid);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.post('/bulk-xlsx', parseSingleQuestionsXlsx, async (req, res, next) => {
  try {
    const uid = String(req.userId || '').trim();
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ success: false, error: 'XLSX file is required (field name: file)' });
      return;
    }
    const rows = questionAdmin.parseQuestionsXlsx(file.buffer);
    const result = await questionAdmin.bulkInsertQuestions(rows, uid);
    res.json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
});

export default router;
