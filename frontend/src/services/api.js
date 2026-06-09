import { authHeadersAsync } from '../utils/authToken.js';

const API_BASE = '/api';

async function readJsonResponse(res) {
    const text = await res.text();
    if (!text || !text.trim()) {
        return {};
    }
    try {
        return JSON.parse(text);
    } catch {
        return { error: 'Invalid server response (not JSON). Is the API running on port 3000?' };
    }
}

/**
 * Reusable API service for the Skilz project.
 */
export const api = {
    // Fetch all pricing plans
    getPlans: async () => {
        const res = await fetch(`${API_BASE}/plans`);
        if (!res.ok) throw new Error('Failed to fetch plans');
        return res.json();
    },

    // Fetch user info

    getUser: async (userId) => {
        const res = await fetch(`${API_BASE}/user/${userId}`);
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
    },

    // Process checkout

    processCheckout: async (payload) => {
        const res = await fetch(`${API_BASE}/checkout`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Checkout failed');
        return data;
    },

    uploadPaymentScreenshot: async ({ image, orderId }) => {
        const form = new FormData();
        form.append('image', image);
        form.append('orderId', orderId);
        const headers = await authHeadersAsync({});
        delete headers['Content-Type'];
        const res = await fetch(`${API_BASE}/payment/upload-screenshot`, {
            method: 'POST',
            headers,
            body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Upload failed');
        return data;
    },

    createPaymentRequest: async (payload) => {
        const res = await fetch(`${API_BASE}/payment/create-request`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Could not create payment request');
        return data;
    },

    subscribeNewsletter: async (email) => {
        const res = await fetch(`${API_BASE}/newsletter/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) {
            throw new Error(
                data.error ||
                data.message ||
                (res.status === 502 || res.status === 504
                    ? 'API unreachable. From the repo root run: npm run dev (starts frontend + backend on :3000).'
                    : 'Newsletter subscription failed')
            );
        }
        return data;
    },

    unsubscribeNewsletter: async (email) => {
        const query = encodeURIComponent(String(email || ''));
        const res = await fetch(`${API_BASE}/newsletter/unsubscribe?email=${query}`);
        const data = await readJsonResponse(res);
        if (!res.ok) {
            throw new Error(data.error || data.message || 'Newsletter unsubscribe failed');
        }
        return data;
    },

    /*
     * Admin API (mounted at backend `routes/adminRoutes.js` → `/api/admin/*`).
     * Browser console stacks often cite this file (`api.js`) + `AdminPaymentsDashboard.jsx` effects.
     * 403 here usually means either:
     *   - `middleware/auth.js` → Firebase `verifyIdToken` failed ("Invalid or expired token"), or
     *   - `middleware/adminMiddleware.js` → email ≠ ADMIN_EMAIL or Firestore `users/{uid}.role` ≠ "admin".
     * 401 "Access token required" → missing `Authorization` (see `utils/authToken.js` + session timing).
     */
    getAdminPayments: async (filters = '') => {
        let query = '';
        if (typeof filters === 'string') {
            query = filters ? `?status=${encodeURIComponent(filters)}` : '';
        } else {
            const params = new URLSearchParams();
            if (filters?.status) params.set('status', filters.status);
            if (filters?.method) params.set('method', filters.method);
            if (filters?.query) params.set('query', filters.query);
            if (Number.isFinite(filters?.page)) params.set('page', String(filters.page));
            if (Number.isFinite(filters?.limit)) params.set('limit', String(filters.limit));
            query = params.toString() ? `?${params.toString()}` : '';
        }

        // GET /api/admin/payments — fails in Network tab as 403 if token invalid or user not admin (server decides).

        const res = await fetch(`${API_BASE}/admin/payments${query}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load payments');
        return data;
    },

    getAdminPaymentStats: async () => {
        // GET /api/admin/payment-stats — same auth chain as other admin GETs; stack traces often show this line in dev.
        const res = await fetch(`${API_BASE}/admin/payment-stats`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load payment stats');
        return data;
    },

    approvePayment: async (requestId, reason = '') => {
        const res = await fetch(`${API_BASE}/admin/approve`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify({ requestId, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Approve failed');
        return data;
    },

    rejectPayment: async (payload) => {
        const requestId = typeof payload === 'string' ? payload : payload?.requestId;
        const reason = typeof payload === 'string' ? '' : String(payload?.reason || '');
        const res = await fetch(`${API_BASE}/admin/reject`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify({ requestId, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Reject failed');
        return data;
    },

    getAdminUsers: async (params = {}) => {
        const qs = new URLSearchParams();
        if (params?.query) qs.set('query', String(params.query));
        if (params?.role) qs.set('role', String(params.role));
        if (params?.status) qs.set('status', String(params.status));
        if (params?.sortBy) qs.set('sortBy', String(params.sortBy));
        if (params?.sortDir) qs.set('sortDir', String(params.sortDir));
        if (Number.isFinite(params?.page)) qs.set('page', String(params.page));
        if (Number.isFinite(params?.limit)) qs.set('limit', String(params.limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        // GET /api/admin/users — 403 source: backend auth + requireAdmin (not this file).
        const res = await fetch(`${API_BASE}/admin/users${suffix}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load users');
        return data;
    },

    getAdminUserById: async (userId) => {
        const res = await fetch(`${API_BASE}/admin/user/${encodeURIComponent(userId)}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load user details');
        return data;
    },

    updateAdminUserRole: async ({ userId, role, reason = '' }) => {
        const res = await fetch(`${API_BASE}/admin/update-role`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify({ userId, role, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to update role');
        return data;
    },

    blockAdminUser: async ({ userId, reason = '' }) => {
        const res = await fetch(`${API_BASE}/admin/block-user`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify({ userId, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to block user');
        return data;
    },

    unblockAdminUser: async ({ userId, reason = '' }) => {
        const res = await fetch(`${API_BASE}/admin/unblock-user`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify({ userId, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to unblock user');
        return data;
    },

    getAdminDashboardMetrics: async (range = 'monthly') => {
        const res = await fetch(`${API_BASE}/admin/metrics?range=${encodeURIComponent(range)}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load metrics');
        return data;
    },

    getAdminRevenueTrends: async (range = 'monthly') => {
        const res = await fetch(`${API_BASE}/admin/revenue-trends?range=${encodeURIComponent(range)}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load revenue trends');
        return data;
    },

    getAdminPaymentVolume: async (range = 'weekly', channel = 'all') => {
        const params = new URLSearchParams({
            range: String(range || 'weekly'),
            channel: String(channel || 'all'),
        });
        const res = await fetch(`${API_BASE}/admin/payment-volume?${params.toString()}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load payment volume');
        return data;
    },

    getAdminEvents: async (limit = 20) => {
        const res = await fetch(`${API_BASE}/admin/events?limit=${encodeURIComponent(String(limit))}`, {
            headers: await authHeadersAsync(),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load events');
        return data;
    },

    /** Public blog list (published only, no full content). */
    getBlogsPublished: async () => {
        const res = await fetch(`${API_BASE}/blogs`);
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load blogs');
        return data;
    },

    /** Public single blog by slug (full content). */
    getBlogBySlug: async (slug) => {
        const res = await fetch(`${API_BASE}/blogs/${encodeURIComponent(String(slug || ''))}`);
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load blog');
        return data;
    },

    /** Admin: all blogs including drafts; status = all | draft | published */
    getAdminBlogs: async (status = 'all') => {
        const q =
            status && String(status).toLowerCase() !== 'all'
                ? `?status=${encodeURIComponent(String(status))}`
                : '';
        const res = await fetch(`${API_BASE}/admin/blogs${q}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load admin blogs');
        return data;
    },

    createBlog: async (formData) => {
        const headers = await authHeadersAsync({});
        delete headers['Content-Type'];
        const res = await fetch(`${API_BASE}/blogs`, {
            method: 'POST',
            headers,
            body: formData,
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to create blog');
        return data;
    },

    updateBlog: async (id, formData) => {
        const headers = await authHeadersAsync({});
        delete headers['Content-Type'];
        const res = await fetch(`${API_BASE}/blogs/${encodeURIComponent(String(id))}`, {
            method: 'PUT',
            headers,
            body: formData,
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to update blog');
        return data;
    },

    deleteBlog: async (id) => {
        const res = await fetch(`${API_BASE}/blogs/${encodeURIComponent(String(id))}`, {
            method: 'DELETE',
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete blog');
        return data;
    },

    seedDefaultBlogs: async () => {
        const res = await fetch(`${API_BASE}/blogs/seed-defaults`, {
            method: 'POST',
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to seed default blogs');
        return data;
    },

    /** Public contact form (rate-limited server-side). */
    submitContact: async (payload) => {
        const res = await fetch(`${API_BASE}/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) {
            const hasMsg = Boolean(data?.error || data?.message);
            throw new Error(
                data.error ||
                data.message ||
                (res.status === 429
                    ? 'Too many submissions. Please wait a minute and try again.'
                    : !hasMsg
                        ? 'Cannot reach the API (nothing on port 3000). From the repository root run: npm run dev — that starts Vite and the Express backend together. Or run npm run dev:backend in a second terminal.'
                        : 'Could not send your message')
            );
        }
        return data;
    },

    getAdminContactMessages: async (params = {}) => {
        const qs = new URLSearchParams();
        if (params?.status) qs.set('status', String(params.status));
        if (params?.cursorDocId) qs.set('cursorDocId', String(params.cursorDocId));
        if (Number.isFinite(params?.limit)) qs.set('limit', String(params.limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const res = await fetch(`${API_BASE}/admin/contact-messages${suffix}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load contact messages');
        return data;
    },

    patchAdminContactMessage: async (id, payload) => {
        const res = await fetch(`${API_BASE}/admin/contact-messages/${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to update message');
        return data;
    },

    /** Sends reply email to the contact address; sets status=replied on success. Requires SMTP env on server. */
    sendAdminContactReply: async (id, payload) => {
        const res = await fetch(
            `${API_BASE}/admin/contact-messages/${encodeURIComponent(String(id))}/send-reply`,
            {
                method: 'POST',
                headers: {
                    ...(await authHeadersAsync()),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            }
        );
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to send reply email');
        return data;
    },

    /** Admin: trivia question bank (Firestore). */
    getAdminQuestionStats: async () => {
        const res = await fetch(`${API_BASE}/admin/questions/stats`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load question stats');
        return data;
    },

    getAdminQuestions: async (params = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set('q', String(params.q));
        if (params.category) qs.set('category', String(params.category));
        if (params.difficulty) qs.set('difficulty', String(params.difficulty));
        if (params.active === true || params.active === false) qs.set('active', String(params.active));
        if (Number.isFinite(params.limit)) qs.set('limit', String(params.limit));
        if (params.cursor) qs.set('cursor', String(params.cursor));
        if (params.gameType) qs.set('gameType', String(params.gameType));
        if (params.type) qs.set('type', String(params.type));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const res = await fetch(`${API_BASE}/admin/questions${suffix}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load questions');
        return data;
    },

    createAdminQuestion: async (payload) => {
        const res = await fetch(`${API_BASE}/admin/questions`, {
            method: 'POST',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to create question');
        return data;
    },

    getAdminQuestion: async (id) => {
        const res = await fetch(`${API_BASE}/admin/questions/${encodeURIComponent(String(id))}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load question');
        return data;
    },

    updateAdminQuestion: async (id, payload) => {
        const res = await fetch(`${API_BASE}/admin/questions/${encodeURIComponent(String(id))}`, {
            method: 'PATCH',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to update question');
        return data;
    },

    deleteAdminQuestion: async (id) => {
        const res = await fetch(`${API_BASE}/admin/questions/${encodeURIComponent(String(id))}`, {
            method: 'DELETE',
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to delete question');
        return data;
    },

    bulkInsertAdminQuestions: async (rows) => {
        const res = await fetch(`${API_BASE}/admin/questions/bulk-json`, {
            method: 'POST',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rows }),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Bulk insert failed');
        return data;
    },

    bulkUploadAdminQuestionsCsv: async (file) => {
        const form = new FormData();
        form.append('file', file);
        const headers = await authHeadersAsync({});
        delete headers['Content-Type'];
        const res = await fetch(`${API_BASE}/admin/questions/bulk-csv`, {
            method: 'POST',
            headers,
            body: form,
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'CSV upload failed');
        return data;
    },

    bulkUploadAdminQuestionsXlsx: async (file) => {
        const form = new FormData();
        form.append('file', file);
        const headers = await authHeadersAsync({});
        delete headers['Content-Type'];
        const res = await fetch(`${API_BASE}/admin/questions/bulk-xlsx`, {
            method: 'POST',
            headers,
            body: form,
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Excel upload failed');
        return data;
    },

    getRecentEnigmaResults: async (params = {}) => {
        const qs = new URLSearchParams();
        if (params.gameKey) qs.set('gameKey', String(params.gameKey));
        if (Number.isFinite(params.limit)) qs.set('limit', String(params.limit));
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        const res = await fetch(`${API_BASE}/enigma/results${suffix}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Failed to load Enigma results');
        return data;
    },

    /**
     * Global website search (games, pages, blogs).
     */
    searchGlobal: async ({ q, limit = 8, type = '', cursor = '' } = {}) => {
        const params = new URLSearchParams();
        params.set('q', String(q || '').trim());
        if (Number.isFinite(limit)) params.set('limit', String(limit));
        if (type) params.set('type', String(type));
        if (cursor) params.set('cursor', String(cursor));
        const res = await fetch(`${API_BASE}/search?${params.toString()}`, {
            headers: await authHeadersAsync({}),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Search failed');
        return data;
    },

    trackSearchAnalytics: async (payload) => {
        const res = await fetch(`${API_BASE}/search/analytics`, {
            method: 'POST',
            headers: await authHeadersAsync(),
            body: JSON.stringify(payload || {}),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.error || data.message || 'Search analytics failed');
        return data;
    },

    /** Public game economy (lobbies) — no auth required. */
    getPublicGameConfig: async () => {
        const res = await fetch(`${API_BASE}/game-config`);
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to load game config');
        return data;
    },

    getPublicGameConfigSlice: async (gameKey, variantKey = null) => {
        const base = `${API_BASE}/game-config/${encodeURIComponent(String(gameKey))}`;
        const url = variantKey
            ? `${base}/${encodeURIComponent(String(variantKey))}`
            : base;
        const res = await fetch(url);
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to load game config');
        return data;
    },

    getAdminGameConfig: async () => {
        const res = await fetch(`${API_BASE}/admin/game-config`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to load admin game config');
        return data;
    },

    updateAdminGameConfig: async (config) => {
        const res = await fetch(`${API_BASE}/admin/game-config`, {
            method: 'PUT',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to save game config');
        return data;
    },

    patchAdminGameConfig: async (gameKey, patch) => {
        const res = await fetch(`${API_BASE}/admin/game-config/${encodeURIComponent(String(gameKey))}`, {
            method: 'PATCH',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(patch),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to update game config');
        return data;
    },

    seedAdminGameConfig: async ({ force = false } = {}) => {
        const res = await fetch(`${API_BASE}/admin/game-config/seed`, {
            method: 'POST',
            headers: {
                ...(await authHeadersAsync()),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ force }),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to seed game config');
        return data;
    },

    getAdminGameConfigAudit: async (limit = 20) => {
        const params = new URLSearchParams();
        params.set('limit', String(limit));
        const res = await fetch(`${API_BASE}/admin/game-config/audit?${params.toString()}`, {
            headers: await authHeadersAsync(),
        });
        const data = await readJsonResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to load game config audit');
        return data;
    },
};

