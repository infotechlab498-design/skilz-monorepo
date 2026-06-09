import express from 'express';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const STATIC_INDEX = [
  { id: 'page-home', type: 'page', title: 'Home', description: 'Prime Gaming home page', route: '/', isPublic: true },
  { id: 'page-blogs', type: 'page', title: 'Blogs', description: 'Read gaming blogs and updates', route: '/blogs', isPublic: true },
  { id: 'page-leaderboard', type: 'page', title: 'Leaderboard', description: 'Top players and rankings', route: '/leaderboard', isPublic: true },
  { id: 'page-guide', type: 'page', title: 'Guide', description: 'How to play and tutorials', route: '/guide', isPublic: true },
  { id: 'page-about', type: 'page', title: 'About Us', description: 'Learn more about Prime Gaming', route: '/about', isPublic: true },
  { id: 'page-contact', type: 'page', title: 'Contact Us', description: 'Reach out to the team', route: '/contact', isPublic: true },
  { id: 'game-ludo', type: 'game', title: 'Ludo Game', description: 'Multiplayer ludo lobby', route: '/ludoLobby', isPublic: false, requiresAuth: true },
  { id: 'game-trivia', type: 'game', title: 'Trivia', description: 'Trivia lobby and quiz matches', route: '/triviaLobby/trivia', isPublic: false, requiresAuth: true },
  { id: 'game-math', type: 'game', title: 'Math Rush', description: 'Math Rush lobby and matches', route: '/mathRushLobby', isPublic: false, requiresAuth: true },
  { id: 'game-enigma', type: 'game', title: 'Enigma Pulse', description: 'Enigma Pulse lobby and logic challenges', route: '/enigmaPulseLobby', isPublic: false, requiresAuth: true },
  { id: 'game-neurochain', type: 'game', title: 'NeuroChain', description: 'NeuroChain lobby and sessions', route: '/neurochainLobby', isPublic: false, requiresAuth: true },
];

function norm(v) {
  return String(v || '').trim().toLowerCase();
}

function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset: Number(offset) || 0 }), 'utf8').toString('base64url');
}

function decodeCursor(raw) {
  try {
    if (!raw) return 0;
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    const n = Number(parsed?.offset);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  } catch {
    return 0;
  }
}

function scoreItem(item, q) {
  const title = norm(item.title);
  const desc = norm(item.description);
  const query = norm(q);
  if (!query) return 0;
  if (title === query) return 100;
  if (title.startsWith(query)) return 75;
  if (title.includes(query)) return 55;
  if (desc.includes(query)) return 35;
  return 0;
}

async function searchPublishedBlogs(query, limit) {
  const db = getAdminFirestore();
  if (!db) return [];
  const qn = norm(query);
  if (!qn) return [];
  try {
    const snap = await db.collection('blogs').where('status', '==', 'published').limit(300).get();
    const rows = snap.docs
      .map((doc) => {
        const d = doc.data() || {};
        const title = String(d.title || '');
        const excerpt = String(d.excerpt || '');
        const slug = String(d.slug || '').trim();
        if (!title || !slug) return null;
        return {
          id: `blog-${doc.id}`,
          type: 'blog',
          title,
          description: excerpt,
          route: `/blogs/${encodeURIComponent(slug)}`,
          isPublic: true,
        };
      })
      .filter(Boolean)
      .map((item) => ({ ...item, score: scoreItem(item, qn) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, limit);
    return rows;
  } catch {
    return [];
  }
}

async function isAdminUser(uid) {
  const db = getAdminFirestore();
  if (!db || !uid) return false;
  try {
    const userSnap = await db.collection('users').doc(uid).get();
    const role = String(userSnap.data()?.role || '').trim().toLowerCase();
    return role === 'admin';
  } catch {
    return false;
  }
}

function applyVisibilityFilter(items, { isAuthenticated, isAdmin }) {
  return items.filter((item) => {
    if (item.requiresAdmin) return Boolean(isAdmin);
    if (item.isPublic) return true;
    if (item.requiresAuth) return Boolean(isAuthenticated);
    return true;
  });
}

function normalizeProviderResult(item) {
  const type = String(item?.type || item?.entityType || 'page').trim().toLowerCase();
  return {
    id: String(item?.id || `${type}-${item?.route || item?.title || 'result'}`),
    type,
    title: String(item?.title || '').trim(),
    description: String(item?.description || item?.excerpt || '').trim(),
    route: String(item?.route || item?.url || '/').trim(),
    isPublic: item?.isPublic !== false,
    requiresAuth: Boolean(item?.requiresAuth),
    requiresAdmin: Boolean(item?.requiresAdmin),
    score: Number(item?.score || item?._rankingScore || 0),
  };
}

async function searchViaMeilisearch({ q, limit, offset, type }) {
  const host = String(process.env.MEILI_HOST || '').trim().replace(/\/+$/, '');
  const index = String(process.env.MEILI_INDEX || 'global_search').trim();
  const key = String(process.env.MEILI_SEARCH_KEY || process.env.MEILI_API_KEY || '').trim();
  if (!host || !index) return null;
  const url = `${host}/indexes/${encodeURIComponent(index)}/search`;
  const body = {
    q,
    limit: Math.max(1, Math.min(limit, 100)),
    offset: Math.max(0, offset),
  };
  if (type) body.filter = [`type = "${type}"`];
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Meilisearch failed (${res.status})`);
  const data = await res.json();
  const rows = Array.isArray(data?.hits) ? data.hits.map(normalizeProviderResult) : [];
  return {
    rows,
    estimatedTotal: Number(data?.estimatedTotalHits || data?.totalHits || rows.length) || rows.length,
  };
}

async function searchViaAlgolia({ q, limit, offset }) {
  const appId = String(process.env.ALGOLIA_APP_ID || '').trim();
  const apiKey = String(process.env.ALGOLIA_SEARCH_KEY || '').trim();
  const indexName = String(process.env.ALGOLIA_INDEX || 'global_search').trim();
  if (!appId || !apiKey || !indexName) return null;
  const page = Math.floor(Math.max(0, offset) / Math.max(1, limit));
  const hitsPerPage = Math.max(1, Math.min(limit, 100));
  const url = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName)}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-API-Key': apiKey,
      'X-Algolia-Application-Id': appId,
    },
    body: JSON.stringify({ query: q, page, hitsPerPage }),
  });
  if (!res.ok) throw new Error(`Algolia failed (${res.status})`);
  const data = await res.json();
  const rows = Array.isArray(data?.hits) ? data.hits.map(normalizeProviderResult) : [];
  return {
    rows,
    estimatedTotal: Number(data?.nbHits || rows.length) || rows.length,
  };
}

async function writeSearchAnalytics(payload) {
  const db = getAdminFirestore();
  if (!db) return;
  try {
    await db.collection('searchAnalytics').add({
      ...payload,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking analytics
  }
}

router.get('/search', optionalAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const type = String(req.query.type || '').trim().toLowerCase();
  const cursorOffset = decodeCursor(req.query.cursor);
  const parsedLimit = Number(req.query.limit);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 25) : 8;
  const uid = String(req.userId || '').trim();
  const isAuthenticated = Boolean(uid);
  const isAdmin = isAuthenticated ? await isAdminUser(uid) : false;
  const provider = String(process.env.SEARCH_PROVIDER || 'internal').trim().toLowerCase();

  if (q.length < 2) {
    return res.json({
      success: true,
      q,
      total: 0,
      nextCursor: null,
      results: [],
      grouped: { game: [], page: [], blog: [] },
    });
  }

  let all = [];
  let estimatedTotal = 0;

  if (provider === 'meilisearch' || provider === 'meili') {
    try {
      const remote = await searchViaMeilisearch({
        q,
        limit,
        offset: cursorOffset,
        type,
      });
      if (remote) {
        all = remote.rows;
        estimatedTotal = remote.estimatedTotal;
      }
    } catch {
      all = [];
    }
  } else if (provider === 'algolia') {
    try {
      const remote = await searchViaAlgolia({
        q,
        limit,
        offset: cursorOffset,
      });
      if (remote) {
        all = remote.rows;
        estimatedTotal = remote.estimatedTotal;
      }
    } catch {
      all = [];
    }
  }

  if (all.length === 0) {
    const staticHits = STATIC_INDEX.map((item) => ({ ...item, score: scoreItem(item, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const blogHits = await searchPublishedBlogs(q, 300);
    const combined = [...staticHits, ...blogHits];
    const byType = type ? combined.filter((row) => row.type === type) : combined;
    const visible = applyVisibilityFilter(byType, { isAuthenticated, isAdmin });
    estimatedTotal = visible.length;
    all = visible.slice(cursorOffset, cursorOffset + limit);
  } else {
    all = applyVisibilityFilter(all, { isAuthenticated, isAdmin });
  }

  const nextOffset = cursorOffset + all.length;
  const nextCursor = nextOffset < estimatedTotal ? encodeCursor(nextOffset) : null;

  const grouped = {
    game: all.filter((i) => i.type === 'game'),
    page: all.filter((i) => i.type === 'page'),
    blog: all.filter((i) => i.type === 'blog'),
  };

  return res.json({
    success: true,
    q,
    total: all.length,
    estimatedTotal,
    nextCursor,
    cursor: req.query.cursor || null,
    provider: all.length > 0 ? provider : 'internal',
    results: all.map(({ score, ...rest }) => rest),
    grouped: {
      game: grouped.game.map(({ score, ...rest }) => rest),
      page: grouped.page.map(({ score, ...rest }) => rest),
      blog: grouped.blog.map(({ score, ...rest }) => rest),
    },
  });
});

router.post('/search/analytics', optionalAuth, async (req, res) => {
  const eventType = String(req.body?.eventType || '').trim().toLowerCase();
  const q = String(req.body?.q || '').trim().slice(0, 120);
  if (!eventType || !q) {
    return res.status(400).json({ success: false, error: 'eventType and q are required' });
  }
  await writeSearchAnalytics({
    eventType,
    q,
    resultCount: Number(req.body?.resultCount || 0) || 0,
    clickedResultId: String(req.body?.clickedResultId || '').trim(),
    clickedRoute: String(req.body?.clickedRoute || '').trim(),
    clickedType: String(req.body?.clickedType || '').trim(),
    userId: String(req.userId || '').trim() || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
    source: String(req.body?.source || 'header').trim().slice(0, 50),
  });
  return res.json({ success: true });
});

export default router;
