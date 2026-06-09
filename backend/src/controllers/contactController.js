import crypto from 'crypto';
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';
import { validateContactPayload, validateAdminContactPatch, validateContactReplySend } from '../middleware/validation.js';
import { isContactReplySmtpConfigured, sendContactReplyEmail } from '../services/contactReplyEmail.js';

const COLLECTION = 'contactMessages';
const STATS_TTL_MS = 60_000;

let statsCache = { at: 0, data: null };

function firestoreRequired() {
  const firestore = getAdminFirestore();
  if (!firestore) throw createHttpError(503, 'Firestore Admin is not configured');
  return firestore;
}

function invalidateContactStatsCache() {
  statsCache = { at: 0, data: null };
}

function tsToIso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return null;
}

function hashIp(req) {
  const raw =
    (typeof req.ip === 'string' && req.ip) ||
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.socket?.remoteAddress ||
    '';
  const pepper = String(process.env.CONTACT_IP_PEPPER || 'skilz-contact');
  return crypto.createHash('sha256').update(`${raw}|${pepper}`).digest('hex');
}

function serializeContactDoc(doc) {
  const d = doc.data() || {};
  return {
    id: doc.id,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    email: d.email ?? '',
    message: d.message ?? '',
    status: d.status ?? 'new',
    source: d.source ?? '',
    adminNotes: d.adminNotes ?? '',
    replyBody: d.replyBody ?? '',
    replySentAt: tsToIso(d.replySentAt),
    replyEmailLastError: d.replyEmailLastError ?? '',
    userAgent: d.userAgent ?? '',
    createdAt: tsToIso(d.createdAt),
    updatedAt: tsToIso(d.updatedAt),
  };
}

async function loadContactStats(firestore) {
  const base = firestore.collection(COLLECTION);
  const statuses = ['new', 'read', 'replied', 'archived'];
  const pairs = await Promise.all(
    statuses.map(async (s) => {
      const snap = await base.where('status', '==', s).select(FieldPath.documentId()).get();
      return [s, snap.size];
    })
  );
  const byStatus = Object.fromEntries(pairs);
  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return { ...byStatus, total };
}

async function getCachedContactStats(firestore) {
  const now = Date.now();
  if (statsCache.data && now - statsCache.at < STATS_TTL_MS) {
    return statsCache.data;
  }
  const data = await loadContactStats(firestore);
  statsCache = { at: now, data };
  return data;
}

export async function submitContactMessage(req, res, next) {
  try {
    const parsed = validateContactPayload(req.body);
    if (!parsed.ok) {
      throw createHttpError(400, parsed.error);
    }

    const firestore = firestoreRequired();
    const { firstName, lastName, email, message } = parsed.data;

    const ua = String(req.headers['user-agent'] || '').slice(0, 512);
    const ipHash = hashIp(req);

    await firestore.collection(COLLECTION).add({
      firstName,
      lastName,
      email,
      message,
      status: 'new',
      source: 'web_contact',
      adminNotes: '',
      replyBody: '',
      replyEmailLastError: '',
      userAgent: ua,
      ipHash,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    invalidateContactStatsCache();
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function listAdminContactMessages(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const statusRaw = String(req.query.status || '').trim().toLowerCase();
    const statusFilter =
      statusRaw && ['new', 'read', 'replied', 'archived'].includes(statusRaw) ? statusRaw : '';

    let limit = parseInt(String(req.query.limit || '20'), 10);
    if (!Number.isFinite(limit) || limit < 1) limit = 20;
    if (limit > 50) limit = 50;

    const cursorDocId = String(req.query.cursorDocId || '').trim();

    let q = firestore.collection(COLLECTION);
    if (statusFilter) {
      q = q.where('status', '==', statusFilter);
    }
    q = q.orderBy('createdAt', 'desc').limit(limit + 1);

    if (cursorDocId) {
      const cursorSnap = await firestore.collection(COLLECTION).doc(cursorDocId).get();
      if (!cursorSnap.exists) {
        throw createHttpError(400, 'Invalid cursor');
      }
      q = q.startAfter(cursorSnap);
    }

    const snap = await q.get();
    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;
    const messages = docs.map(serializeContactDoc);
    const last = docs[docs.length - 1];
    const nextCursor = hasMore && last ? last.id : null;

    const stats = await getCachedContactStats(firestore);

    res.json({
      success: true,
      messages,
      nextCursor,
      stats,
    });
  } catch (err) {
    next(err);
  }
}

export async function patchAdminContactMessage(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) throw createHttpError(400, 'Missing message id');

    const parsed = validateAdminContactPatch(req.body);
    if (!parsed.ok) {
      throw createHttpError(400, parsed.error);
    }

    const firestore = firestoreRequired();
    const ref = firestore.collection(COLLECTION).doc(id);
    const existing = await ref.get();
    if (!existing.exists) {
      throw createHttpError(404, 'Message not found');
    }

    await ref.update({
      ...parsed.patch,
      updatedAt: FieldValue.serverTimestamp(),
    });

    invalidateContactStatsCache();
    const updated = await ref.get();
    res.json({ success: true, message: serializeContactDoc(updated) });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/contact-messages/:id/send-reply
 * Sends replyBody to the inquiry email via SMTP; sets status=replied on success.
 */
export async function sendAdminContactReply(req, res, next) {
  try {
    if (!isContactReplySmtpConfigured()) {
      throw createHttpError(
        503,
        'Email delivery is not configured. Set SMTP_HOST and CONTACT_REPLY_FROM_EMAIL (see backend/.env.example).'
      );
    }

    const id = String(req.params.id || '').trim();
    if (!id) throw createHttpError(400, 'Missing message id');

    const parsed = validateContactReplySend(req.body);
    if (!parsed.ok) {
      throw createHttpError(400, parsed.error);
    }

    const firestore = firestoreRequired();
    const ref = firestore.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      throw createHttpError(404, 'Message not found');
    }

    const d = snap.data() || {};
    const status = String(d.status || 'new').toLowerCase();
    if (status === 'archived') {
      throw createHttpError(400, 'Cannot send reply to an archived inquiry');
    }

    const toEmail = String(d.email || '').trim().toLowerCase();
    if (!toEmail) {
      throw createHttpError(400, 'Inquiry has no email address');
    }

    const sendResult = await sendContactReplyEmail({
      toEmail,
      visitorFirstName: d.firstName,
      replyBodyPlain: parsed.data.replyBody,
      originalMessagePlain: d.message,
    });

    if (!sendResult.ok) {
      await ref.update({
        replyEmailLastError: sendResult.errorMessage || 'send_failed',
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw createHttpError(502, `Email could not be sent: ${sendResult.errorMessage || 'unknown error'}`);
    }

    const updatePayload = {
      replyBody: parsed.data.replyBody,
      replySentAt: FieldValue.serverTimestamp(),
      replyEmailLastError: '',
      status: 'replied',
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (parsed.data.adminNotes !== undefined) {
      updatePayload.adminNotes = parsed.data.adminNotes;
    }

    await ref.update(updatePayload);
    invalidateContactStatsCache();

    const updated = await ref.get();
    res.json({ success: true, message: serializeContactDoc(updated) });
  } catch (err) {
    next(err);
  }
}
