import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '../services/firebaseAdmin.js';
import { createHttpError } from '../middleware/errorHandler.js';

const PAYMENT_REQUESTS_FALLBACK_CAP = 4000;

function firestoreRequired() {
  const firestore = getAdminFirestore();
  if (!firestore) throw createHttpError(503, 'Firestore Admin is not configured');
  return firestore;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeLower(v) {
  return String(v || '').trim().toLowerCase();
}

function toDateAny(v) {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function adminFirestoreDebug() {
  return process.env.ADMIN_FIRESTORE_DEBUG === '1';
}

function isFailedPrecondition(err) {
  const c = err?.code;
  if (c === 9 || c === 'failed-precondition') return true;
  return /FAILED_PRECONDITION|failed-precondition/i.test(String(err?.message || ''));
}

function adminControllerErrorLog(req, err, extra = {}) {
  console.error('ADMIN CONTROLLER ERROR', {
    route: req?.path || req?.url || '',
    message: err?.message,
    code: err?.code,
    ...extra,
  });
}

/**
 * Run a Firestore query; on missing composite index, fetch a capped window without orderBy and filter in memory.
 */
async function fetchPaymentRequestsSnapshot(firestore, primaryGet) {
  try {
    const snap = await primaryGet();
    return { snap, degraded: false };
  } catch (err) {
    if (!isFailedPrecondition(err)) throw err;
    console.error('ADMIN FIRESTORE INDEX:', err.message);
    const snap = await firestore.collection('paymentRequests').limit(PAYMENT_REQUESTS_FALLBACK_CAP).get();
    return { snap, degraded: true };
  }
}

function paymentRequestFromDoc(doc) {
  const d = doc.data() || {};
  if (adminFirestoreDebug()) {
    console.log('RAW DOC', doc.id, d);
  }
  const createdAt = toDateAny(d.createdAt);
  const amount = safeNumber(d.amount ?? d.totalAmount ?? d.coinsRequested, 0);
  const paymentMethod = safeLower(d.paymentMethod || d.method) || 'unknown';
  const statusStr = String(d.status || 'pending');
  return {
    id: doc.id,
    d,
    createdAt,
    amount,
    paymentMethod,
    statusNorm: safeLower(statusStr) || 'pending',
  };
}

function normalizePaymentRequestDoc(doc) {
  const p = paymentRequestFromDoc(doc);
  const { d } = p;
  return {
    id: p.id,
    orderId: String(d.orderId || ''),
    userId: String(d.userId || ''),
    userName: String(d.userName || d.name || ''),
    userEmail: String(d.userEmail || d.email || ''),
    coinsRequested: Math.floor(safeNumber(d.coinsRequested, p.amount)),
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    method: p.paymentMethod,
    status: p.statusNorm || 'pending',
    screenshotUrl: String(d.screenshotUrl || ''),
    createdAt: p.createdAt?.toISOString() || null,
    approvedAt: toDateAny(d.approvedAt)?.toISOString() || null,
    rejectedAt: toDateAny(d.rejectedAt)?.toISOString() || null,
    fraudFlag: Boolean(d.fraudFlag),
    rejectReason: String(d.rejectReason || ''),
    approvedBy: String(d.approvedBy || ''),
    rejectedBy: String(d.rejectedBy || ''),
  };
}

function normalizePaymentRequestDocSafe(doc) {
  try {
    return normalizePaymentRequestDoc(doc);
  } catch (err) {
    console.error('ADMIN PAYMENT DOC SKIP', doc?.id, err?.message);
    return {
      id: doc.id,
      orderId: '',
      userId: '',
      userName: '',
      userEmail: '',
      coinsRequested: 0,
      amount: 0,
      paymentMethod: 'unknown',
      method: 'unknown',
      status: 'pending',
      screenshotUrl: '',
      createdAt: null,
      approvedAt: null,
      rejectedAt: null,
      fraudFlag: false,
      rejectReason: '',
      approvedBy: '',
      rejectedBy: '',
    };
  }
}

function comparePaymentCreatedDesc(a, b) {
  const at = new Date(a.createdAt || 0).getTime();
  const bt = new Date(b.createdAt || 0).getTime();
  return bt - at;
}

function normalizeUserDoc(doc) {
  const row = doc.data() || {};
  return {
    uid: doc.id,
    name: row.displayName || row.name || 'Player',
    email: row.email || '',
    coins: Number(row.coins || 0),
    role: safeLower(row.role) === 'admin' ? 'admin' : 'user',
    status: safeLower(row.status) === 'blocked' ? 'blocked' : 'active',
    createdAt: toDateAny(row.createdAt)?.toISOString() || null,
    lastActiveAt: toDateAny(row.lastActiveAt || row.updatedAt)?.toISOString() || null,
    photoURL: row.photoURL || row.avatarUrl || '',
    suspicious: Boolean(row.suspicious || row.riskFlag),
  };
}

function paginateRows(rows, page, limit) {
  const total = rows.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  return {
    rows: rows.slice(start, end),
    pagination: {
      page,
      limit,
      total,
      hasNext: end < total,
    },
  };
}

function computeUserStats(rows) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  let activeUsers = 0;
  let blockedUsers = 0;
  let adminUsers = 0;
  let bannedToday = 0;
  for (const user of rows) {
    if (user.role === 'admin') adminUsers += 1;
    if (user.status === 'blocked') {
      blockedUsers += 1;
      const ts = new Date(user.lastActiveAt || user.createdAt || 0).getTime();
      if (ts >= dayStart) bannedToday += 1;
    } else {
      activeUsers += 1;
    }
  }
  return {
    totalUsers: rows.length,
    activeUsers,
    adminUsers,
    blockedUsers,
    bannedToday,
  };
}

export async function getAdminUsers(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const query = safeLower(req.query?.query);
    const role = safeLower(req.query?.role);
    const status = safeLower(req.query?.status);
    const sortBy = safeLower(req.query?.sortBy || 'createdat');
    const sortDir = safeLower(req.query?.sortDir || 'desc') === 'asc' ? 'asc' : 'desc';
    const page = Math.max(1, Math.floor(safeNumber(req.query?.page, 1)));
    const limit = Math.min(100, Math.max(1, Math.floor(safeNumber(req.query?.limit, 20))));

    const snap = await firestore.collection('users').orderBy('createdAt', 'desc').limit(2000).get();
    let users = snap.docs.map((d) => normalizeUserDoc(d));

    if (query) {
      users = users.filter((u) => {
        const uid = safeLower(u.uid);
        const name = safeLower(u.name);
        const email = safeLower(u.email);
        return uid.includes(query) || name.includes(query) || email.includes(query);
      });
    }
    if (role && ['admin', 'user'].includes(role)) {
      users = users.filter((u) => safeLower(u.role) === role);
    }
    if (status && ['active', 'blocked'].includes(status)) {
      users = users.filter((u) => safeLower(u.status) === status);
    }

    users.sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'coins') return (safeNumber(a.coins) - safeNumber(b.coins)) * direction;
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return (at - bt) * direction;
    });

    const stats = computeUserStats(users);
    const paginated = paginateRows(users, page, limit);

    return res.json({
      success: true,
      users: paginated.rows,
      stats,
      pagination: paginated.pagination,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getAdminUserById(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const userId = String(req.params?.id || '').trim();
    if (!userId) throw createHttpError(400, 'user id is required');
    const userRef = firestore.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) throw createHttpError(404, 'User not found');
    const user = normalizeUserDoc(userSnap);

    const { snap: paymentsSnap, degraded: paymentsDegraded } = await fetchPaymentRequestsSnapshot(
      firestore,
      () =>
        firestore
          .collection('paymentRequests')
          .where('userId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(8)
          .get()
    );
    let payDocs = paymentsSnap.docs;
    if (paymentsDegraded) {
      payDocs = payDocs.filter((d) => String((d.data() || {}).userId || '').trim() === userId);
      payDocs.sort((a, b) => {
        const at = toDateAny((a.data() || {}).createdAt)?.getTime() || 0;
        const bt = toDateAny((b.data() || {}).createdAt)?.getTime() || 0;
        return bt - at;
      });
      payDocs = payDocs.slice(0, 8);
    }
    const paymentHistory = payDocs.map((d) => {
      const n = normalizePaymentRequestDocSafe(d);
      return {
        id: n.id,
        orderId: n.orderId,
        paymentMethod: n.paymentMethod,
        status: n.status,
        coinsRequested: n.coinsRequested,
        createdAt: n.createdAt,
      };
    });

    return res.json({ success: true, user, paymentHistory });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getAdminUserById' });
    return next(error);
  }
}

async function mutateUserStatusAndRole({
  firestore,
  req,
  userId,
  updates,
  action,
  reason,
}) {
  const userRef = firestore.collection('users').doc(userId);
  const beforeSnap = await userRef.get();
  if (!beforeSnap.exists) throw createHttpError(404, 'User not found');
  const before = beforeSnap.data() || {};
  await userRef.set(
    {
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  const afterSnap = await userRef.get();
  const after = afterSnap.data() || {};
  await writeAdminLog(firestore, {
    adminId: req.adminUser?.uid || '',
    adminEmail: req.adminUser?.email || '',
    action,
    targetUserId: userId,
    reason: String(reason || '').trim(),
    before: {
      role: before.role || 'user',
      status: before.status || 'active',
      coins: Number(before.coins || 0),
    },
    after: {
      role: after.role || 'user',
      status: after.status || 'active',
      coins: Number(after.coins || 0),
    },
    type: 'user_management',
    title: `${action} (${userId})`,
    message: `Admin action ${action} executed`,
  });
}

export async function updateUserRole(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const userId = String(req.body?.userId || '').trim();
    const role = safeLower(req.body?.role);
    const reason = String(req.body?.reason || '').trim();
    if (!userId) throw createHttpError(400, 'userId is required');
    if (!['admin', 'user'].includes(role)) throw createHttpError(400, 'role must be admin or user');

    await mutateUserStatusAndRole({
      firestore,
      req,
      userId,
      updates: { role },
      action: 'CHANGE_ROLE',
      reason,
    });

    return res.json({ success: true, message: 'User role updated' });
  } catch (error) {
    return next(error);
  }
}

export async function blockUser(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const userId = String(req.body?.userId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!userId) throw createHttpError(400, 'userId is required');

    await mutateUserStatusAndRole({
      firestore,
      req,
      userId,
      updates: { status: 'blocked', blockedAt: FieldValue.serverTimestamp() },
      action: 'BLOCK_USER',
      reason,
    });

    return res.json({ success: true, message: 'User blocked' });
  } catch (error) {
    return next(error);
  }
}

export async function unblockUser(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const userId = String(req.body?.userId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!userId) throw createHttpError(400, 'userId is required');

    await mutateUserStatusAndRole({
      firestore,
      req,
      userId,
      updates: { status: 'active', unblockedAt: FieldValue.serverTimestamp() },
      action: 'UNBLOCK_USER',
      reason,
    });

    return res.json({ success: true, message: 'User unblocked' });
  } catch (error) {
    return next(error);
  }
}

function resolveRange(range) {
  const key = safeLower(range);
  if (key === 'weekly') {
    return { key: 'weekly', days: 7, bucket: 'day' };
  }
  if (key === 'yearly') {
    return { key: 'yearly', days: 365, bucket: 'month' };
  }
  return { key: 'monthly', days: 30, bucket: 'day' };
}

function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
}

function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function writeAdminLog(firestore, payload) {
  const ref = firestore.collection('adminLogs').doc();
  await ref.set({
    id: ref.id,
    createdAt: FieldValue.serverTimestamp(),
    timestamp: FieldValue.serverTimestamp(),
    ...payload,
  });
}

export async function getAdminPayments(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const status = safeLower(req.query?.status);
    const method = safeLower(req.query?.method);
    const search = safeLower(req.query?.query);
    const page = Math.max(1, Math.floor(safeNumber(req.query?.page, 1)));
    const limit = Math.min(100, Math.max(1, Math.floor(safeNumber(req.query?.limit, 20))));
    const validStatus = ['pending', 'approved', 'rejected'];
    const validMethods = ['jazzcash', 'easypaisa', 'bank'];

    const { snap, degraded } = await fetchPaymentRequestsSnapshot(firestore, () => {
      let q = firestore.collection('paymentRequests');
      if (status && validStatus.includes(status)) {
        q = q.where('status', '==', status);
      }
      if (method && validMethods.includes(method)) {
        q = q.where('paymentMethod', '==', method);
      }
      return q.orderBy('createdAt', 'desc').limit(500).get();
    });

    let rows = snap.docs.map((d) => normalizePaymentRequestDocSafe(d));
    if (degraded) {
      if (status && validStatus.includes(status)) {
        rows = rows.filter((r) => safeLower(r.status) === status);
      }
      if (method && validMethods.includes(method)) {
        rows = rows.filter((r) => safeLower(r.paymentMethod) === method);
      }
      rows.sort(comparePaymentCreatedDesc);
      rows = rows.slice(0, 500);
    }

    if (search) {
      rows = rows.filter((row) => {
        const orderId = safeLower(row.orderId);
        const email = safeLower(row.userEmail);
        const name = safeLower(row.userName);
        return orderId.includes(search) || email.includes(search) || name.includes(search);
      });
    }

    const total = rows.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const payments = rows.slice(start, end);

    return res.json({
      success: true,
      payments,
      pagination: {
        page,
        limit,
        total,
        hasNext: end < total,
      },
    });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getAdminPayments' });
    return next(error);
  }
}

export async function getAdminPaymentStats(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const { snap, degraded } = await fetchPaymentRequestsSnapshot(firestore, () =>
      firestore.collection('paymentRequests').orderBy('createdAt', 'desc').limit(4000).get()
    );
    let docs = snap.docs;
    if (degraded) {
      docs = [...docs].sort((a, b) => {
        const at = toDateAny((a.data() || {}).createdAt)?.getTime() || 0;
        const bt = toDateAny((b.data() || {}).createdAt)?.getTime() || 0;
        return bt - at;
      });
      docs = docs.slice(0, 4000);
    }

    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    let totalRequests = 0;
    let pendingRequests = 0;
    let rejectedRequests = 0;
    let approvedToday = 0;

    for (const doc of docs) {
      let p;
      try {
        p = paymentRequestFromDoc(doc);
      } catch {
        continue;
      }
      totalRequests += 1;
      const st = p.statusNorm;
      if (st === 'pending') pendingRequests += 1;
      if (st === 'rejected') rejectedRequests += 1;
      if (st === 'approved') {
        const approvedAt = toDateAny(p.d.approvedAt || p.d.updatedAt || p.d.createdAt);
        if (approvedAt && approvedAt.getTime() >= dayStart) approvedToday += 1;
      }
    }

    return res.json({
      success: true,
      stats: {
        totalRequests,
        pendingRequests,
        approvedToday,
        rejectedRequests,
      },
    });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getAdminPaymentStats' });
    return next(error);
  }
}

export async function getAdminMetrics(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const range = resolveRange(req.query?.range);
    const now = new Date();
    const start = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);

    const [paymentsResult, usersSnap, sessionsSnap] = await Promise.all([
      fetchPaymentRequestsSnapshot(firestore, () =>
        firestore.collection('paymentRequests').orderBy('createdAt', 'desc').limit(2000).get()
      ),
      firestore.collection('users').limit(2000).get(),
      firestore.collection('sessions').orderBy('createdAt', 'desc').limit(3000).get().catch(() => null),
    ]);

    let paymentDocs = paymentsResult.snap.docs;
    if (paymentsResult.degraded) {
      paymentDocs = [...paymentDocs].sort((a, b) => {
        const at = toDateAny((a.data() || {}).createdAt)?.getTime() || 0;
        const bt = toDateAny((b.data() || {}).createdAt)?.getTime() || 0;
        return bt - at;
      });
      paymentDocs = paymentDocs.slice(0, 2000);
    }

    const approvedPayments = [];
    let flagged = 0;
    let resolvedFraud = 0;
    for (const doc of paymentDocs) {
      let p;
      try {
        p = paymentRequestFromDoc(doc);
      } catch {
        continue;
      }
      if (!p.createdAt || p.createdAt < start) continue;
      if (p.statusNorm === 'approved') {
        approvedPayments.push(p);
      }
      const isFlagged = p.statusNorm === 'flagged' || Boolean(p.d.fraudFlag);
      if (isFlagged) flagged += 1;
      if (isFlagged && ['rejected', 'blocked'].includes(p.statusNorm)) resolvedFraud += 1;
    }

    const activeUsers = new Set();
    if (sessionsSnap?.docs?.length) {
      for (const doc of sessionsSnap.docs) {
        const row = doc.data() || {};
        const createdAt = toDateAny(row.createdAt || row.updatedAt);
        if (!createdAt || createdAt < start) continue;
        const uid = String(row.userId || row.uid || '').trim();
        if (uid) activeUsers.add(uid);
      }
    } else {
      for (const doc of usersSnap.docs) {
        const row = doc.data() || {};
        const activeAt = toDateAny(row.lastActiveAt || row.updatedAt || row.createdAt);
        if (activeAt && activeAt >= start) activeUsers.add(doc.id);
      }
    }

    const revenue = approvedPayments.reduce((sum, p) => sum + safeNumber(p.amount), 0);
    const mau = activeUsers.size;
    const arpu = mau > 0 ? revenue / mau : 0;

    let churned = 0;
    let totalTracked = 0;
    const staleThreshold = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    for (const doc of usersSnap.docs) {
      const row = doc.data() || {};
      const createdAt = toDateAny(row.createdAt);
      if (!createdAt || createdAt > start) continue;
      totalTracked += 1;
      const lastActiveAt = toDateAny(row.lastActiveAt || row.updatedAt || createdAt);
      if (lastActiveAt && lastActiveAt < staleThreshold) churned += 1;
    }
    const churnRate = totalTracked > 0 ? (churned / totalTracked) * 100 : 0;
    const fraudPrevention = flagged > 0 ? (resolvedFraud / flagged) * 100 : 99.9;

    return res.json({
      success: true,
      metrics: {
        mau: Math.round(mau),
        arpu: Number(arpu.toFixed(2)),
        churnRate: Number(churnRate.toFixed(2)),
        fraudPrevention: Number(fraudPrevention.toFixed(2)),
      },
    });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getAdminMetrics' });
    return next(error);
  }
}

export async function getRevenueTrends(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const range = resolveRange(req.query?.range);
    const now = new Date();
    const start = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    const { snap, degraded } = await fetchPaymentRequestsSnapshot(firestore, () =>
      firestore
        .collection('paymentRequests')
        .where('status', '==', 'approved')
        .orderBy('createdAt', 'asc')
        .limit(4000)
        .get()
    );

    let docs = snap.docs;
    if (degraded) {
      docs = docs.filter((doc) => safeLower((doc.data() || {}).status) === 'approved');
      docs = [...docs].sort((a, b) => {
        const at = toDateAny((a.data() || {}).createdAt)?.getTime() || 0;
        const bt = toDateAny((b.data() || {}).createdAt)?.getTime() || 0;
        return at - bt;
      });
      docs = docs.slice(0, 4000);
    }

    const map = new Map();
    for (const doc of docs) {
      let p;
      try {
        p = paymentRequestFromDoc(doc);
      } catch {
        continue;
      }
      if (!p.createdAt || p.createdAt < start) continue;
      const key = range.bucket === 'month' ? monthKey(p.createdAt) : dayKey(p.createdAt);
      map.set(key, safeNumber(map.get(key)) + p.amount);
    }

    const points = Array.from(map.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([label, value]) => ({ label, value: Number(safeNumber(value).toFixed(2)) }));

    return res.json({ success: true, points });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getRevenueTrends' });
    return next(error);
  }
}

export async function getPaymentVolume(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const range = resolveRange(req.query?.range);
    const channel = safeLower(req.query?.channel || 'all');
    const now = new Date();
    const start = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
    const { snap, degraded } = await fetchPaymentRequestsSnapshot(firestore, () =>
      firestore.collection('paymentRequests').orderBy('createdAt', 'asc').limit(4000).get()
    );

    let docs = snap.docs;
    if (degraded) {
      docs = [...docs].sort((a, b) => {
        const at = toDateAny((a.data() || {}).createdAt)?.getTime() || 0;
        const bt = toDateAny((b.data() || {}).createdAt)?.getTime() || 0;
        return at - bt;
      });
      docs = docs.slice(0, 4000);
    }

    const dayMap = new Map();
    const channels = {
      jazzcash: 0,
      easypaisa: 0,
      bank: 0,
    };

    for (const doc of docs) {
      let p;
      try {
        p = paymentRequestFromDoc(doc);
      } catch {
        continue;
      }
      if (!p.createdAt || p.createdAt < start) continue;
      const method = p.paymentMethod;
      if (method in channels) channels[method] += 1;
      if (channel !== 'all' && method !== channel) continue;
      const dayStart = startOfDay(p.createdAt);
      const key = dayKey(dayStart);
      dayMap.set(key, safeNumber(dayMap.get(key)) + 1);
    }

    const series = Array.from(dayMap.entries())
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .map(([label, count]) => ({ label, count: safeNumber(count) }));

    return res.json({ success: true, series, channels });
  } catch (error) {
    adminControllerErrorLog(req, error, { handler: 'getPaymentVolume' });
    return next(error);
  }
}

export async function getAdminEvents(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const limit = Math.min(100, Math.max(1, Math.floor(safeNumber(req.query?.limit, 20))));
    const [adminLogsSnap, systemEventsSnap] = await Promise.all([
      firestore.collection('adminLogs').orderBy('createdAt', 'desc').limit(limit).get().catch(() => null),
      firestore.collection('systemEvents').orderBy('createdAt', 'desc').limit(limit).get().catch(() => null),
    ]);

    const events = [];
    for (const doc of adminLogsSnap?.docs || []) {
      const row = doc.data() || {};
      events.push({
        id: doc.id,
        type: safeLower(row.decision || row.type || 'admin_action'),
        title: row.title || row.message || `Payment ${row.decision || 'action'}`,
        subtitle: row.reason || row.requestId || '',
        createdAt: toDateAny(row.createdAt)?.toISOString() || null,
        source: 'adminLogs',
      });
    }
    for (const doc of systemEventsSnap?.docs || []) {
      const row = doc.data() || {};
      events.push({
        id: doc.id,
        type: safeLower(row.type || 'system_event'),
        title: row.title || row.message || 'System event',
        subtitle: row.subtitle || row.detail || '',
        createdAt: toDateAny(row.createdAt)?.toISOString() || null,
        source: 'systemEvents',
      });
    }

    events.sort((a, b) => {
      const at = new Date(a.createdAt || 0).getTime();
      const bt = new Date(b.createdAt || 0).getTime();
      return bt - at;
    });

    return res.json({ success: true, events: events.slice(0, limit) });
  } catch (error) {
    return next(error);
  }
}

export async function approvePayment(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const requestId = String(req.body?.requestId || '').trim();
    if (!requestId) throw createHttpError(400, 'requestId is required');

    const paymentRef = firestore.collection('paymentRequests').doc(requestId);
    const result = await firestore.runTransaction(async (tx) => {
      const paymentSnap = await tx.get(paymentRef);
      if (!paymentSnap.exists) throw createHttpError(404, 'Payment request not found');
      const payment = paymentSnap.data() || {};
      if (payment.status !== 'pending') {
        return {
          status: payment.status,
          alreadyHandled: true,
          userId: String(payment.userId || ''),
          coinsRequested: Number(payment.coinsRequested || 0),
        };
      }
      const userId = String(payment.userId || '').trim();
      if (!userId) throw createHttpError(400, 'Payment request has invalid userId');
      const coinsRequested = Math.floor(Number(payment.coinsRequested || 0));
      if (coinsRequested <= 0) throw createHttpError(400, 'Payment request has invalid coinsRequested');

      const userRef = firestore.collection('users').doc(userId);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) throw createHttpError(404, 'Target user not found');

      tx.set(
        userRef,
        {
          coins: FieldValue.increment(coinsRequested),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        paymentRef,
        {
          status: 'approved',
          approvedAt: FieldValue.serverTimestamp(),
          approvedBy: req.adminUser?.uid || '',
        },
        { merge: true }
      );
      return { status: 'approved', alreadyHandled: false, userId, coinsRequested };
    });

    console.info('[admin-payment] approve', {
      adminUid: req.adminUser?.uid || '',
      requestId,
      status: result.status,
      alreadyHandled: result.alreadyHandled,
      userId: result.userId,
      coinsRequested: result.coinsRequested,
    });

    await writeAdminLog(firestore, {
      adminUid: req.adminUser?.uid || '',
      adminId: req.adminUser?.uid || '',
      adminEmail: req.adminUser?.email || '',
      requestId,
      paymentId: requestId,
      action: 'APPROVE_PAYMENT',
      decision: 'approved',
      reason: String(req.body?.reason || '').trim(),
      type: 'payment_approved',
      title: `Payment approved (${requestId})`,
      message: 'Payment approved and user coins credited',
      userId: result.userId || '',
      coinsRequested: result.coinsRequested || 0,
    });

    return res.json({
      success: true,
      message: result.alreadyHandled
        ? `Request already ${result.status}`
        : 'Payment approved and coins credited',
      status: result.status,
    });
  } catch (error) {
    return next(error);
  }
}

export async function rejectPayment(req, res, next) {
  try {
    const firestore = firestoreRequired();
    const requestId = String(req.body?.requestId || '').trim();
    if (!requestId) throw createHttpError(400, 'requestId is required');
    const paymentRef = firestore.collection('paymentRequests').doc(requestId);
    const snap = await paymentRef.get();
    if (!snap.exists) throw createHttpError(404, 'Payment request not found');
    const data = snap.data() || {};
    if (data.status !== 'pending') {
      return res.json({
        success: true,
        message: `Request already ${data.status}`,
        status: data.status,
      });
    }
    await paymentRef.set(
      {
        status: 'rejected',
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: req.adminUser?.uid || '',
        rejectReason: String(req.body?.reason || '').trim(),
      },
      { merge: true }
    );
    console.info('[admin-payment] reject', {
      adminUid: req.adminUser?.uid || '',
      requestId,
    });

    await writeAdminLog(firestore, {
      adminUid: req.adminUser?.uid || '',
      adminId: req.adminUser?.uid || '',
      adminEmail: req.adminUser?.email || '',
      requestId,
      paymentId: requestId,
      action: 'REJECT_PAYMENT',
      decision: 'rejected',
      reason: String(req.body?.reason || '').trim(),
      type: 'payment_rejected',
      title: `Payment rejected (${requestId})`,
      message: 'Payment request rejected by admin',
      userId: String(data.userId || ''),
      coinsRequested: Number(data.coinsRequested || 0),
    });

    return res.json({
      success: true,
      message: 'Payment request rejected',
      status: 'rejected',
    });
  } catch (error) {
    return next(error);
  }
}
