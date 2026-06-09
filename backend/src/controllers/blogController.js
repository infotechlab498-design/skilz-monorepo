import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';
import {
  uploadBlogCoverBuffer,
  destroyCloudinaryByUrl,
} from '../services/cloudinaryService.js';
import { LEGACY_BLOGS } from '../data/legacyBlogs.js';

const COLLECTION = 'blogs';

function firestoreRequired() {
  const firestore = getAdminFirestore();
  if (!firestore) throw createHttpError(503, 'Firestore Admin is not configured');
  return firestore;
}

function slugifyTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/['\u2018\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'post';
}

export function deriveReadTimeFromContent(content) {
  const words = String(content || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const mins = Math.max(1, Math.ceil(words / 200));
  return `${mins} min read`;
}

function tsToIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function parseTags(raw) {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  const s = String(raw).trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map((t) => String(t).trim()).filter(Boolean) : [];
    } catch {
      /* fall through */
    }
  }
  return s
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeStatus(s) {
  const v = String(s || 'draft').toLowerCase().trim();
  if (v === 'published') return 'published';
  return 'draft';
}

async function assertSlugUnique(firestore, slug, excludeDocId) {
  const snap = await firestore.collection(COLLECTION).where('slug', '==', slug).limit(2).get();
  for (const doc of snap.docs) {
    if (excludeDocId && doc.id === excludeDocId) continue;
    throw createHttpError(409, 'Slug already in use');
  }
}

function serializeBlogDoc(doc, { includeContent = true } = {}) {
  const d = doc.data() || {};
  const base = {
    id: doc.id,
    title: d.title ?? '',
    slug: d.slug ?? '',
    excerpt: d.excerpt ?? '',
    coverImage: d.coverImage ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    status: d.status ?? 'draft',
    author: d.author ?? '',
    readTime: d.readTime || deriveReadTimeFromContent(d.content),
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
  if (includeContent) base.content = d.content ?? '';
  return base;
}

function serializeLegacyBlog(raw, index) {
  return {
    id: `legacy-${index + 1}`,
    title: raw.title || '',
    slug: raw.slug || slugifyTitle(raw.title || ''),
    excerpt: raw.excerpt || '',
    coverImage: raw.coverImage || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    status: raw.status || 'published',
    author: raw.author || '',
    readTime: raw.readTime || deriveReadTimeFromContent(raw.content || ''),
    createdAt: null,
    updatedAt: null,
    content: raw.content || '',
  };
}

/**
 * GET /api/blogs — published posts only, excerpt + meta (no full content).
 */
export async function listPublishedBlogs(req, res, next) {
  try {
    const firestore = firestoreRequired();
    let snap;
    try {
      snap = await firestore
        .collection(COLLECTION)
        .where('status', '==', 'published')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
    } catch (err) {
      if (err.code !== 9 && !/index/i.test(String(err.message))) throw err;
      const loose = await firestore.collection(COLLECTION).limit(500).get();
      const rows = loose.docs
        .map((doc) => serializeBlogDoc(doc, { includeContent: false }))
        .filter((b) => b.status === 'published')
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return res.json({ success: true, blogs: rows.slice(0, 200) });
    }
    const blogs = snap.docs.map((doc) => serializeBlogDoc(doc, { includeContent: false }));
    if (blogs.length === 0) {
      const legacyRows = LEGACY_BLOGS.map((b, i) => serializeLegacyBlog(b, i)).map((b) => ({
        id: b.id,
        title: b.title,
        slug: b.slug,
        excerpt: b.excerpt,
        coverImage: b.coverImage,
        tags: b.tags,
        status: b.status,
        author: b.author,
        readTime: b.readTime,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }));
      return res.json({ success: true, blogs: legacyRows, source: 'legacy-fallback' });
    }
    return res.json({ success: true, blogs });
  } catch (e) {
    return next(e);
  }
}

/**
 * GET /api/blogs/:slug — single published post with full content (optional admin draft via header).
 */
export async function getBlogBySlug(req, res, next) {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) throw createHttpError(400, 'Slug required');
    const firestore = firestoreRequired();
    const snap = await firestore.collection(COLLECTION).where('slug', '==', slug).limit(1).get();
    if (snap.empty) {
      const legacy = LEGACY_BLOGS.find((b) => String(b.slug || '').trim() === slug);
      if (!legacy) throw createHttpError(404, 'Blog not found');
      return res.json({ success: true, blog: serializeLegacyBlog(legacy, 0), source: 'legacy-fallback' });
    }
    const doc = snap.docs[0];
    const data = serializeBlogDoc(doc, { includeContent: true });
    if (data.status !== 'published') {
      throw createHttpError(404, 'Blog not found');
    }
    return res.json({ success: true, blog: data });
  } catch (e) {
    return next(e);
  }
}

export async function seedLegacyBlogs(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const createdIds = [];
    for (const row of LEGACY_BLOGS) {
      const slug = String(row.slug || '').trim().toLowerCase() || slugifyTitle(row.title || '');
      const existing = await firestore.collection(COLLECTION).where('slug', '==', slug).limit(1).get();
      if (!existing.empty) {
        createdIds.push(existing.docs[0].id);
        continue;
      }
      const ref = await firestore.collection(COLLECTION).add({
        title: row.title || '',
        slug,
        excerpt: row.excerpt || '',
        content: row.content || '',
        coverImage: row.coverImage || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        status: row.status === 'draft' ? 'draft' : 'published',
        author: row.author || req.adminUser?.email || '',
        readTime: row.readTime || deriveReadTimeFromContent(row.content || ''),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      createdIds.push(ref.id);
    }
    return res.json({ success: true, seeded: createdIds.length, ids: createdIds });
  } catch (e) {
    return next(e);
  }
}

/**
 * GET /api/admin/blogs — admin list with full content; ?status=draft|published|all
 */
export async function listAdminBlogs(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const filter = String(req.query.status || 'all').toLowerCase();
    let snap;
    try {
      if (filter === 'draft' || filter === 'published') {
        snap = await firestore
          .collection(COLLECTION)
          .where('status', '==', filter)
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get();
      } else {
        snap = await firestore.collection(COLLECTION).orderBy('createdAt', 'desc').limit(500).get();
      }
    } catch (err) {
      if (err.code !== 9 && !/index/i.test(String(err.message))) throw err;
      snap = await firestore.collection(COLLECTION).limit(500).get();
    }
    let blogs = snap.docs.map((doc) => serializeBlogDoc(doc, { includeContent: true }));
    if (filter === 'draft' || filter === 'published') {
      blogs = blogs.filter((b) => b.status === filter);
    }
    blogs.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({ success: true, blogs });
  } catch (e) {
    return next(e);
  }
}

async function handleCoverUpload(file) {
  if (!file?.buffer?.length) return '';
  const result = await uploadBlogCoverBuffer({ fileBuffer: file.buffer });
  const url = result?.secure_url || result?.url;
  if (!url) throw createHttpError(502, 'Cloudinary upload failed');
  return url;
}

export async function createBlog(req, res, next) {
  try {
    const title = String(req.body?.title || '').trim();
    const content = String(req.body?.content || '').trim();
    if (!title) throw createHttpError(400, 'Title is required');
    if (!content) throw createHttpError(400, 'Content is required');
    const firestore = firestoreRequired();
    let slug = String(req.body?.slug || '').trim().toLowerCase() || slugifyTitle(title);
    await assertSlugUnique(firestore, slug);
    const excerpt = String(req.body?.excerpt || '').trim();
    const author = String(req.body?.author || req.adminUser?.email || '').trim();
    const status = normalizeStatus(req.body?.status);
    const tags = parseTags(req.body?.tags);
    const readTimeRaw = String(req.body?.readTime || '').trim();
    const readTime = readTimeRaw || deriveReadTimeFromContent(content);
    let coverImage = String(req.body?.coverImage || '').trim();
    if (req.file?.buffer?.length) {
      coverImage = await handleCoverUpload(req.file);
    }
    const ref = await firestore.collection(COLLECTION).add({
      title,
      slug,
      excerpt,
      content,
      coverImage,
      tags,
      status,
      author,
      readTime,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const created = await ref.get();
    return res.status(201).json({
      success: true,
      blog: serializeBlogDoc(created, { includeContent: true }),
    });
  } catch (e) {
    return next(e);
  }
}

export async function updateBlog(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) throw createHttpError(400, 'Blog id required');
    const firestore = firestoreRequired();
    const docRef = firestore.collection(COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) throw createHttpError(404, 'Blog not found');
    const prev = existing.data() || {};
    const prevCover = String(prev.coverImage || '').trim();
    const patch = { updatedAt: FieldValue.serverTimestamp() };
    if (req.body.title !== undefined) {
      const t = String(req.body.title || '').trim();
      if (!t) throw createHttpError(400, 'Title cannot be empty');
      patch.title = t;
    }
    if (req.body.content !== undefined) {
      const c = String(req.body.content || '').trim();
      if (!c) throw createHttpError(400, 'Content cannot be empty');
      patch.content = c;
    }
    if (req.body.excerpt !== undefined) patch.excerpt = String(req.body.excerpt || '').trim();
    if (req.body.author !== undefined) patch.author = String(req.body.author || '').trim();
    if (req.body.status !== undefined) patch.status = normalizeStatus(req.body.status);
    if (req.body.tags !== undefined) patch.tags = parseTags(req.body.tags);
    if (req.body.readTime !== undefined) {
      const rt = String(req.body.readTime || '').trim();
      patch.readTime = rt || deriveReadTimeFromContent(patch.content ?? prev.content);
    }
    let newSlug = null;
    if (req.body.slug !== undefined) {
      newSlug = String(req.body.slug || '').trim().toLowerCase();
      if (!newSlug) throw createHttpError(400, 'Slug cannot be empty');
      await assertSlugUnique(firestore, newSlug, id);
      patch.slug = newSlug;
    }
    let newCover = null;
    if (req.file?.buffer?.length) {
      newCover = await handleCoverUpload(req.file);
      patch.coverImage = newCover;
    } else if (req.body.coverImage !== undefined) {
      patch.coverImage = String(req.body.coverImage || '').trim();
    }
    await docRef.update(patch);
    if (newCover && prevCover && prevCover !== newCover) {
      await destroyCloudinaryByUrl(prevCover).catch(() => {});
    }
    const updated = await docRef.get();
    return res.json({ success: true, blog: serializeBlogDoc(updated, { includeContent: true }) });
  } catch (e) {
    return next(e);
  }
}

export async function deleteBlog(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) throw createHttpError(400, 'Blog id required');
    const firestore = firestoreRequired();
    const docRef = firestore.collection(COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) throw createHttpError(404, 'Blog not found');
    const prevCover = String(existing.data()?.coverImage || '').trim();
    await docRef.delete();
    if (prevCover) await destroyCloudinaryByUrl(prevCover).catch(() => {});
    return res.json({ success: true, deleted: id });
  } catch (e) {
    return next(e);
  }
}
