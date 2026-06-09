import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import {
  ENIGMA_PULSE_LOBBY_CATEGORIES,
  ENIGMA_PULSE_ADMIN_CATEGORIES,
  WORD_CIPHER_CATEGORY,
  normalizeEnigmaPulseAdminCategory,
} from '../../../shared/enigmaPulse/categories.js';
import '../styles/adminBlogs.css';

const emptyForm = {
  gameType: 'trivia',
  category: 'history',
  difficulty: 'easy',
  type: 'riddle_classic',
  question: '',
  option1: '',
  option2: '',
  option3: '',
  option4: '',
  correctIndex: 0,
  tags: '',
  active: true,
};

function normalizeCategory(v) {
  const c = String(v || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (c === 'current_affairs' || c === 'current-affairs') return 'current_affairs';
  return 'history';
}

function normalizeDifficulty(v) {
  const d = String(v || 'easy').trim().toLowerCase();
  if (d === 'medium' || d === 'hard') return d;
  return 'easy';
}

function normalizeAdminGameType(v) {
  const g = String(v ?? 'trivia')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (g === 'enigma_pulse' || g === 'enigmapulse') return 'enigma_pulse';
  return 'trivia';
}

/** Minimal CSV parse (quoted fields, doubled quotes). */

function parseCsvText(text) {
  const rows = [];
  let field = '';
  let row = [];
  let i = 0;
  let inQuotes = false;
  const t = String(text || '').replace(/^\uFEFF/, '');

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < t.length) {
    const c = t[i++];
    if (inQuotes) {
      if (c === '"') {
        if (t[i] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushField();
      pushRow();
    } else if (c === '\r') {
      /* skip */
    } else {
      field += c;
    }
  }
  pushField();
  if (row.length > 1 || (row.length === 1 && row[0] !== '')) pushRow();

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const out = [];
  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r];
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx] != null ? String(cells[idx]).trim() : '';
    });
    const empty = Object.values(obj).every((v) => !String(v || '').trim());
    if (!empty) out.push(obj);
  }
  return out;
}

function validateRowPreview(row, defaultGameType = 'trivia') {
  const gameType = normalizeAdminGameType(row.gametype ?? row.game_type ?? row.gameType ?? defaultGameType);
  const enigmaType = String(row.type ?? row.questiontype ?? 'riddle_classic').trim().toLowerCase().replace(/\s+/g, '_');
  const validEnigmaTypes = ['riddle_classic', 'riddle_sequence', 'logic_grid', 'word_cipher', 'syllogism'];
  let category = '';
  if (gameType === 'enigma_pulse') {
    const rawCategory = String(row.category || '').trim();
    category = normalizeEnigmaPulseAdminCategory(rawCategory);
    if (!category) return { ok: false, reason: 'Invalid EnigmaPulse category' };
    if (!validEnigmaTypes.includes(enigmaType)) return { ok: false, reason: 'Invalid EnigmaPulse type' };
    if (enigmaType === 'syllogism' && category !== 'Syllogism') return { ok: false, reason: 'Syllogism type must use category Syllogism' };
    if (enigmaType !== 'syllogism' && category === 'Syllogism') return { ok: false, reason: 'Syllogism category is reserved for syllogism type' };
    if (enigmaType === 'word_cipher' && category !== WORD_CIPHER_CATEGORY) {
      return { ok: false, reason: 'word_cipher type must use category brain_twisters' };
    }
    if (enigmaType !== 'word_cipher' && category === WORD_CIPHER_CATEGORY) {
      return { ok: false, reason: 'brain_twisters category is reserved for word_cipher type' };
    }
  } else {
    category = normalizeCategory(row.category);
  }
  const difficulty = normalizeDifficulty(row.difficulty);
  const question = String(row.question || '').trim();
  const o1 = String(row.option1 || '').trim();
  const o2 = String(row.option2 || '').trim();
  const o3 = String(row.option3 || '').trim();
  const o4 = String(row.option4 || '').trim();
  const options = [o1, o2, o3, o4];
  const ci = Number(row.correctindex != null ? row.correctindex : row.correctIndex);
  const sequence = String(row.sequence || '')
    .split(/[,|]/)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  const patternKind = String(row.patternkind ?? row.pattern_kind ?? '').trim().toLowerCase();
  const hint = String(row.hint || '').trim();
  const explanation = String(row.explanation || '').trim();
  if (!question) return { ok: false, reason: 'Missing question' };
  if (question.length > 500) return { ok: false, reason: 'Question too long' };
  if (options.some((o) => !o)) return { ok: false, reason: 'Missing option(s)' };
  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== 4) return { ok: false, reason: 'Options must be unique' };
  if (!Number.isInteger(ci) || ci < 0 || ci > 3) return { ok: false, reason: 'correctIndex 0–3 required' };
  if (gameType === 'enigma_pulse' && enigmaType === 'riddle_sequence' && sequence.length > 0 && sequence.length < 3) {
    return { ok: false, reason: 'Sequence must include at least 3 nodes when provided' };
  }
  return {
    ok: true,
    payload: {
      gameType,
      category,
      difficulty,
      type: gameType === 'enigma_pulse' ? enigmaType : '',
      question,
      option1: o1,
      option2: o2,
      option3: o3,
      option4: o4,
      correctIndex: ci,
      tags: row.tags || '',
      sequence,
      patternKind,
      hint,
      explanation,
      active: true,
    },
  };
}

export default function AdminQuestions({ onNotify }) {
  const notify = useCallback(
    (msg) => {
      if (typeof onNotify === 'function') onNotify(msg);
    },
    [onNotify]
  );

  const [stats, setStats] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState('');
  const [filterDiff, setFilterDiff] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [filterEnigmaType, setFilterEnigmaType] = useState('');
  const [searchText, setSearchText] = useState('');
  const [appliedSearchText, setAppliedSearchText] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [view, setView] = useState('list');
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [csvRows, setCsvRows] = useState([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  const [bankGameType, setBankGameType] = useState('');
  const [bulkDefaultGameType, setBulkDefaultGameType] = useState('trivia');

  useEffect(() => {
    if (filterEnigmaType === 'word_cipher') {
      setFilterCat(WORD_CIPHER_CATEGORY);
    } else if (filterCat === WORD_CIPHER_CATEGORY) {
      setFilterCat('');
    }
  }, [filterEnigmaType, filterCat]);

  const loadStats = useCallback(async () => {
    try {
      const data = await api.getAdminQuestionStats();
      setStats(data || null);
    } catch (e) {
      notify(e.message || 'Failed stats');
    }
  }, [notify]);

  const fetchPage = useCallback(
    async (cursorVal) => {
      const params = { limit: 25 };
      if (appliedSearchText) params.q = appliedSearchText;
      if (filterCat) params.category = filterCat;
      if (filterDiff) params.difficulty = filterDiff;
      if (filterActive === 'true') params.active = true;
      if (filterActive === 'false') params.active = false;
      if (bankGameType === 'trivia' || bankGameType === 'enigma_pulse') params.gameType = bankGameType;
      if (bankGameType === 'enigma_pulse' && filterEnigmaType) params.type = filterEnigmaType;
      if (cursorVal) params.cursor = cursorVal;
      const data = await api.getAdminQuestions(params);
      return {
        list: Array.isArray(data?.questions) ? data.questions : [],
        next: data?.nextCursor || null,
      };
    },
    [appliedSearchText, filterCat, filterDiff, filterActive, bankGameType, filterEnigmaType]
  );

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { list, next } = await fetchPage(null);
        if (!cancelled) {
          setQuestions(list);
          setNextCursor(next);
        }
      } catch (e) {
        if (!cancelled) {
          notify(e.message || 'Failed to load questions');
          setQuestions([]);
          setNextCursor(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify, fetchPage]);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const { list, next } = await fetchPage(nextCursor);
      setQuestions((prev) => [...prev, ...list]);
      setNextCursor(next);
    } catch (e) {
      notify(e.message || 'Failed to load more');
    } finally {
      setLoading(false);
    }
  };

  const applySearch = () => {
    const next = String(searchText || '').trim();
    setAppliedSearchText(next);
    setNextCursor(null);
  };

  const clearSearch = () => {
    setSearchText('');
    setAppliedSearchText('');
    setNextCursor(null);
  };

  const statsSummary = useMemo(() => {
    const base = { triviaActive: 0, triviaInactive: 0, enigmaActive: 0, enigmaInactive: 0 };
    if (!stats) return base;
    for (const row of stats.breakdown || []) {
      if (row.active) base.triviaActive += Number(row.count) || 0;
      else base.triviaInactive += Number(row.count) || 0;
    }
    for (const row of stats.enigmaBreakdown || []) {
      if (row.active) base.enigmaActive += Number(row.count) || 0;
      else base.enigmaInactive += Number(row.count) || 0;
    }
    return base;
  }, [stats]);

  const resetForm = () => {
    setEditingId('');
    setForm(emptyForm);
  };

  const openCreate = () => {
    resetForm();
    setView('editor');
  };

  const openEdit = (q) => {
    const opts = Array.isArray(q.options) ? q.options : [];
    setEditingId(q.id);
    setForm({
      gameType: q.gameType === 'enigma_pulse' ? 'enigma_pulse' : 'trivia',
      category: q.category || 'history',
      difficulty: q.difficulty || 'easy',
      type: q.type || 'riddle_classic',
      question: q.question || '',
      option1: opts[0] || '',
      option2: opts[1] || '',
      option3: opts[2] || '',
      option4: opts[3] || '',
      correctIndex: Number(q.correctIndex) || 0,
      tags: Array.isArray(q.tags) ? q.tags.join(', ') : '',
      active: Boolean(q.active),
    });
    setView('editor');
  };

  const saveQuestion = async () => {
    const payload = {
      gameType: form.gameType,
      category: form.category,
      difficulty: form.difficulty,
      type: form.gameType === 'enigma_pulse' ? form.type : '',
      question: form.question.trim(),
      option1: form.option1.trim(),
      option2: form.option2.trim(),
      option3: form.option3.trim(),
      option4: form.option4.trim(),
      correctIndex: Number(form.correctIndex),
      tags: form.tags,
      active: form.active,
    };
    const prev = validateRowPreview(
      {
        category: payload.category,
        difficulty: payload.difficulty,
        question: payload.question,
        option1: payload.option1,
        option2: payload.option2,
        option3: payload.option3,
        option4: payload.option4,
        correctIndex: payload.correctIndex,
        gameType: payload.gameType,
        type: payload.type,
        sequence: payload.sequence,
        patternKind: payload.patternKind,
        hint: payload.hint,
        explanation: payload.explanation,
      },
      payload.gameType
    );
    if (!prev.ok) {
      notify(prev.reason);
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await api.updateAdminQuestion(editingId, {
          gameType: payload.gameType,
          category: payload.category,
          difficulty: payload.difficulty,
          type: payload.type,
          question: payload.question,
          options: [payload.option1, payload.option2, payload.option3, payload.option4],
          correctIndex: payload.correctIndex,
          tags: payload.tags,
          sequence: payload.sequence,
          patternKind: payload.patternKind,
          hint: payload.hint,
          explanation: payload.explanation,
          active: payload.active,
        });
        notify('Question updated');
      } else {
        await api.createAdminQuestion(prev.payload);
        notify('Question created');
      }
      setView('list');
      resetForm();
      await loadStats();
      setLoading(true);
      try {
        const { list, next } = await fetchPage(null);
        setQuestions(list);
        setNextCursor(next);
      } catch (e) {
        notify(e.message || 'Reload failed');
      } finally {
        setLoading(false);
      }
    } catch (e) {
      notify(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteAdminQuestion(deleteTarget.id);
      notify('Deleted');
      setDeleteTarget(null);
      await loadStats();
      setLoading(true);
      try {
        const { list, next } = await fetchPage(null);
        setQuestions(list);
        setNextCursor(next);
      } catch (e) {
        notify(e.message || 'Reload failed');
      } finally {
        setLoading(false);
      }
    } catch (e) {
      notify(e.message || 'Delete failed');
    }
  };

  const onCsvSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvFileName(file.name);
    const text = await file.text();
    const raw = parseCsvText(text);
    setCsvRows(raw);
  };

  const csvPreview = useMemo(() => {
    return csvRows.map((row, idx) => {
      const v = validateRowPreview(row, bulkDefaultGameType);
      return { idx, row, ...v };
    });
  }, [csvRows, bulkDefaultGameType]);

  const uploadCsvValid = async () => {
    const payloads = csvPreview.filter((r) => r.ok).map((r) => r.payload);
    if (payloads.length === 0) {
      notify('No valid rows to upload');
      return;
    }
    setCsvBusy(true);
    try {
      const result = await api.bulkInsertAdminQuestions(payloads);
      notify(`Imported ${result.created || 0} questions (${(result.skipped || []).length} skipped)`);
      setCsvRows([]);
      setCsvFileName('');
      setLoading(true);
      try {
        const { list, next } = await fetchPage(null);
        setQuestions(list);
        setNextCursor(next);
      } catch (e) {
        notify(e.message || 'Reload failed');
      } finally {
        setLoading(false);
      }
      await loadStats();
    } catch (err) {
      notify(err.message || 'Upload failed');
    } finally {
      setCsvBusy(false);
    }
  };

  const uploadCsvFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      setCsvBusy(true);
      try {
        const result = await api.bulkUploadAdminQuestionsCsv(file);
        notify(`Imported ${result.created || 0} questions (${(result.skipped || []).length} skipped)`);
        setLoading(true);
        try {
          const { list, next } = await fetchPage(null);
          setQuestions(list);
          setNextCursor(next);
        } catch (e) {
          notify(e.message || 'Reload failed');
        } finally {
          setLoading(false);
        }
        await loadStats();
      } catch (err) {
        notify(err.message || 'CSV upload failed');
      } finally {
        setCsvBusy(false);
      }
    };
    input.click();
  };

  const uploadXlsxFile = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    input.onchange = async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      setCsvBusy(true);
      try {
        const result = await api.bulkUploadAdminQuestionsXlsx(file);
        notify(`Imported ${result.created || 0} questions (${(result.skipped || []).length} skipped)`);
        setLoading(true);
        try {
          const { list, next } = await fetchPage(null);
          setQuestions(list);
          setNextCursor(next);
        } catch (e) {
          notify(e.message || 'Reload failed');
        } finally {
          setLoading(false);
        }
        await loadStats();
      } catch (err) {
        notify(err.message || 'Excel upload failed');
      } finally {
        setCsvBusy(false);
      }
    };
    input.click();
  };

  return (
    <div className="adminBlogsV2">
      {view === 'list' ? (
        <>
          <div className="adminBlogsV2Top">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={bankGameType}
                onChange={(e) => {
                  setBankGameType(e.target.value);
                  setFilterCat('');
                  setFilterEnigmaType('');
                }}
                className="adminBlogsV2Search"
                style={{ maxWidth: 160 }}
              >
                <option value="">All banks</option>
                <option value="trivia">Trivia only</option>
                <option value="enigma_pulse">EnigmaPulse only</option>
              </select>
              {bankGameType === 'enigma_pulse' ? (
                <select
                  value={filterEnigmaType}
                  onChange={(e) => setFilterEnigmaType(e.target.value)}
                  className="adminBlogsV2Search"
                  style={{ maxWidth: 180 }}
                >
                  <option value="">All Enigma types</option>
                  {/* <option value="riddle_classic">riddle_classic</option> */}
                  <option value="riddle_sequence">Pattern Recognition</option>
                  {/* <option value="logic_grid">Logic Master</option> */}
                  <option value="word_cipher">Word Cipher</option>
                  <option value="syllogism">Syllogism</option>
                </select>
              ) : null}
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                className="adminBlogsV2Search"
                style={{ maxWidth: 180 }}
              >
                <option value="">All categories</option>
                {bankGameType === 'enigma_pulse'
                  ? ENIGMA_PULSE_ADMIN_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c === WORD_CIPHER_CATEGORY ? 'Brain Twisters (Word Cipher)' : c}
                    </option>
                  ))
                  : (
                    <>
                      <option value="history">History</option>
                      <option value="current_affairs">Current affairs</option>
                      {/* <option value="pattern_recognition">Pattern recognition</option> */}
                      {/* <option value="syllogism">Syllogism</option> */}
                    </>
                  )}
              </select>
              <select
                value={filterDiff}
                onChange={(e) => setFilterDiff(e.target.value)}
                className="adminBlogsV2Search"
                style={{ maxWidth: 140 }}
              >
                <option value="">All difficulties</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="adminBlogsV2Search"
                style={{ maxWidth: 140 }}
              >
                <option value="">Active + inactive</option>
                <option value="true">Active only</option>
                <option value="false">Inactive only</option>
              </select>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearch();
                }}
                className="adminBlogsV2Search"
                style={{ maxWidth: 220 }}
                placeholder="Search question text"
              />
              <button type="button" className="adminBlogsV2Ghost" onClick={applySearch}>
                Search
              </button>
              <button type="button" className="adminBlogsV2Ghost" onClick={clearSearch}>
                Clear
              </button>
            </div>
            <button type="button" className="adminBlogsV2Primary" onClick={openCreate}>
              + Add question
            </button>
          </div>

          <h2 className="adminBlogsV2Title">Trivia & EnigmaPulse question bank</h2>
          <p className="adminBlogsV2Sub">
            Firestore-backed questions. Use game type Trivia (history / current affairs) or EnigmaPulse (lobby
            categories). Active rows are visible to the matching game.
          </p>

          <div className="adminBlogsV2Stats">
            <article className="adminBlogsV2Stat">
              <small>TRIVIA ACTIVE</small>
              <h3>{stats ? statsSummary.triviaActive.toLocaleString() : '…'}</h3>
            </article>
            <article className="adminBlogsV2Stat">
              <small>TRIVIA INACTIVE</small>
              <h3>{stats ? statsSummary.triviaInactive.toLocaleString() : '…'}</h3>
            </article>
            <article className="adminBlogsV2Stat">
              <small>ENIGMA ACTIVE</small>
              <h3>{stats ? statsSummary.enigmaActive.toLocaleString() : '…'}</h3>
            </article>
            <article className="adminBlogsV2Stat">
              <small>ENIGMA INACTIVE</small>
              <h3>{stats ? statsSummary.enigmaInactive.toLocaleString() : '…'}</h3>
            </article>
          </div>

          <section className="adminBlogsV2TableCard" style={{ marginBottom: 24 }}>
            <div className="adminBlogsV2TableHead">
              <strong>BULK CSV / EXCEL</strong>
            </div>
            <p className="adminBlogsV2Sub" style={{ padding: '0 16px 8px' }}>
              Columns:{' '}
              <code>
                category,difficulty,type,question,option1,option2,option3,option4,correctIndex[,tags][,gameType][,sequence][,patternKind][,hint][,explanation]
              </code>
              . Optional <code>gameType</code>: <code>trivia</code> or <code>enigma_pulse</code>. Preview upload uses the
              selector below when the column is omitted.
            </p>
            <p className="adminBlogsV2Sub" style={{ padding: '0 16px 8px' }}>
              For Sequence IQ rows, use <code>type=riddle_sequence</code>. Optional <code>sequence</code> can be pipe-delimited
              (example: <code>3|9|27|81|?</code>), with optional <code>hint</code> and <code>explanation</code>.
            </p>
            <p className="adminBlogsV2Sub" style={{ padding: '0 16px 8px' }}>
              For Word Cipher rows, use <code>gameType=enigma_pulse</code>, <code>type=word_cipher</code>, and{' '}
              <code>category=brain_twisters</code> (required). Upload at least 40 active questions per difficulty for full
              1v1 matches.
            </p>
            <label className="adminBlogsV2Sub" style={{ padding: '0 16px 8px', display: 'block' }}>
              Default game type for preview rows (missing column):{' '}
              <select
                value={bulkDefaultGameType}
                onChange={(e) => setBulkDefaultGameType(e.target.value)}
                className="adminBlogsV2Search"
              >
                <option value="trivia">trivia</option>
                <option value="enigma_pulse">enigma_pulse</option>
              </select>
            </label>
            <div style={{ padding: '0 16px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="file" accept=".csv,text/csv,.xlsx" onChange={onCsvSelected} />
              <button type="button" className="adminBlogsV2Ghost" disabled={csvBusy} onClick={uploadCsvFile}>
                Upload CSV (server parse)
              </button>
              <button type="button" className="adminBlogsV2Ghost" disabled={csvBusy} onClick={uploadXlsxFile}>
                Upload Excel (server parse)
              </button>
              <button
                type="button"
                className="adminBlogsV2Primary"
                disabled={csvBusy || csvPreview.filter((r) => r.ok).length === 0}
                onClick={uploadCsvValid}
              >
                {csvBusy ? 'Uploading…' : `Upload ${csvPreview.filter((r) => r.ok).length} valid (preview)`}
              </button>
            </div>
            {csvFileName ? (
              <p className="adminBlogsV2Sub" style={{ padding: '0 16px 8px' }}>
                File: {csvFileName} — {csvRows.length} row(s)
              </p>
            ) : null}
            {csvPreview.length > 0 ? (
              <div className="adminBlogsV2TableWrap" style={{ maxHeight: 280, overflow: 'auto' }}>
                <table className="adminBlogsV2Table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Status</th>
                      <th>Question</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.slice(0, 50).map((r) => (
                      <tr key={r.idx}>
                        <td>{r.idx + 1}</td>
                        <td>
                          {r.ok ? (
                            <span className="status ok">OK</span>
                          ) : (
                            <span className="status warn">{r.reason}</span>
                          )}
                        </td>
                        <td>{String(r.row.question || '').slice(0, 120)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="adminBlogsV2TableCard">
            <div className="adminBlogsV2TableHead">
              <strong>{appliedSearchText ? `QUESTIONS (search: "${appliedSearchText}")` : 'QUESTIONS'}</strong>
            </div>
            {loading ? (
              <p className="adminBlogsV2Empty">Loading…</p>
            ) : questions.length === 0 ? (
              <p className="adminBlogsV2Empty">No questions match filters.</p>
            ) : (
              <div className="adminBlogsV2TableWrap">
                <table className="adminBlogsV2Table">
                  <thead>
                    <tr>
                      <th>Question</th>
                      <th>Game / Cat / Diff</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q) => (
                      <tr key={q.id}>
                        <td className="adminBlogsV2TitleCell">
                          <div>
                            <strong>{String(q.question || '').slice(0, 140)}</strong>
                            <small>{Array.isArray(q.options) ? q.options.join(' · ') : ''}</small>
                            <small>
                              ID: {q.id} · Updated: {q.updatedAt ? new Date(q.updatedAt).toLocaleString() : '—'}
                            </small>
                          </div>
                        </td>
                        <td>
                          {q.gameType || 'trivia'}{q.type ? `/${q.type}` : ''} · {q.category} / {q.difficulty}
                        </td>
                        <td>
                          <span className={`status ${q.active ? 'ok' : 'warn'}`}>{q.active ? 'YES' : 'NO'}</span>
                        </td>
                        <td>
                          <div className="adminBlogsV2Actions">
                            <button type="button" onClick={() => openEdit(q)}>
                              Edit
                            </button>
                            <button type="button" className="danger" onClick={() => setDeleteTarget(q)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {nextCursor ? (
              <div style={{ padding: 16 }}>
                <button type="button" className="adminBlogsV2Ghost" onClick={loadMore} disabled={loading}>
                  Load more
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <div className="adminBlogsV2EditorTop">
            <div className="adminBlogsV2Breadcrumbs">
              Dashboard &gt; Questions &gt; {editingId ? 'Edit' : 'New'}
            </div>
            <div className="adminBlogsV2EditorBtns">
              <button type="button" className="adminBlogsV2Ghost" onClick={() => setView('list')}>
                Cancel
              </button>
              <button type="button" className="adminBlogsV2Primary" onClick={saveQuestion} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>

          <h2 className="adminBlogsV2Title">{editingId ? 'Edit question' : 'New question'}</h2>

          <div className="adminBlogsV2EditorLayout">
            <main className="adminBlogsV2EditorMain">
              <section className="editorCard">
                <label>GAME TYPE</label>
                <select
                  value={form.gameType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      gameType: e.target.value,
                      category: e.target.value === 'enigma_pulse' ? ENIGMA_PULSE_LOBBY_CATEGORIES[0] : 'history',
                      type: e.target.value === 'enigma_pulse' ? 'riddle_classic' : '',
                    }))
                  }
                >
                  <option value="trivia">Trivia</option>
                  <option value="enigma_pulse">EnigmaPulse</option>
                  <option value="pattern_recognition">Pattern Recognition</option>
                  <option value="syllogism">Syllogism</option>
                </select>
                <label>CATEGORY</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {form.gameType === 'enigma_pulse'
                    ? ENIGMA_PULSE_ADMIN_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c === WORD_CIPHER_CATEGORY ? 'Brain Twisters (Word Cipher)' : c}
                      </option>
                    ))
                    : (
                      <>
                        <option value="history">History</option>
                        <option value="current_affairs">Current affairs</option>
                        <option value="pattern_recognition">Pattern recognition</option>
                        <option value="syllogism">Syllogism</option>
                      </>
                    )}
                </select>
                <label>DIFFICULTY</label>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                {form.gameType === 'enigma_pulse' ? (
                  <>
                    <label>ENIGMA TYPE</label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          type: e.target.value,
                          category:
                            e.target.value === 'syllogism'
                              ? 'Syllogism'
                              : e.target.value === 'word_cipher'
                                ? WORD_CIPHER_CATEGORY
                                : p.category === 'Syllogism' || p.category === WORD_CIPHER_CATEGORY
                                  ? ENIGMA_PULSE_LOBBY_CATEGORIES[0]
                                  : p.category,
                        }))
                      }
                    >
                      <option value="riddle_classic">riddle_classic</option>
                      <option value="riddle_sequence">riddle_sequence</option>
                      <option value="logic_grid">logic_grid</option>
                      <option value="word_cipher">word_cipher</option>
                      <option value="syllogism">syllogism</option>
                    </select>
                  </>
                ) : null}
                <label>QUESTION</label>
                <textarea
                  className="contentArea"
                  style={{ minHeight: 100 }}
                  value={form.question}
                  onChange={(e) => setForm((p) => ({ ...p, question: e.target.value }))}
                  placeholder="Question text"
                />
                <label>OPTIONS</label>
                {[1, 2, 3, 4].map((n) => (
                  <input
                    key={n}
                    style={{ marginBottom: 8 }}
                    placeholder={`Option ${n}`}
                    value={form[`option${n}`]}
                    onChange={(e) => setForm((p) => ({ ...p, [`option${n}`]: e.target.value }))}
                  />
                ))}
                <label>CORRECT INDEX (0–3)</label>
                <select
                  value={form.correctIndex}
                  onChange={(e) => setForm((p) => ({ ...p, correctIndex: Number(e.target.value) }))}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
                <label>TAGS (optional, comma-separated)</label>
                <input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                  />
                  Active (visible to players)
                </label>
              </section>
            </main>
          </div>
        </>
      )}

      {deleteTarget ? (
        <div className="adminBlogsV2Modal" onClick={() => setDeleteTarget(null)} role="presentation">
          <div className="adminBlogsV2ModalCard" onClick={(e) => e.stopPropagation()} role="presentation">
            <h3>Delete question?</h3>
            <p>
              This removes <strong>{String(deleteTarget.question || '').slice(0, 80)}</strong> from the bank.
            </p>
            <button type="button" className="dangerFull" onClick={deleteConfirmed}>
              Delete
            </button>
            <button type="button" className="adminBlogsV2Ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
