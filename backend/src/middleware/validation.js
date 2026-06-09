const EMAIL_REGEX =
  /^(?=.{1,254}$)(?=.{1,64}@)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

const MAX_MESSAGE_LEN = 5000;
const MAX_NAME_LEN = 120;
const MAX_NOTES_LEN = 8000;
const MAX_REPLY_EMAIL_LEN = 12000;

/**
 * Validates public contact POST body. Honeypot field `website` must be empty.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function validateContactPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const website = body.website != null ? String(body.website).trim() : '';
  if (website.length > 0) {
    return { ok: false, error: 'Invalid request' };
  }

  const firstName = String(body.firstName ?? '').trim().slice(0, MAX_NAME_LEN);
  const lastName = String(body.lastName ?? '').trim().slice(0, MAX_NAME_LEN);
  const email = String(body.email ?? '').trim().toLowerCase();
  const message = String(body.message ?? '').trim().slice(0, MAX_MESSAGE_LEN);

  if (!firstName) return { ok: false, error: 'First name is required' };
  if (!lastName) return { ok: false, error: 'Last name is required' };
  if (!email) return { ok: false, error: 'Email is required' };
  if (!EMAIL_REGEX.test(email)) return { ok: false, error: 'Invalid email format' };
  if (!message) return { ok: false, error: 'Message is required' };
  if (message.length > MAX_MESSAGE_LEN) return { ok: false, error: 'Message is too long' };

  return {
    ok: true,
    data: { firstName, lastName, email, message },
  };
}

const CONTACT_STATUSES = new Set(['new', 'read', 'replied', 'archived']);

export function normalizeContactStatus(s) {
  const v = String(s || '').toLowerCase().trim();
  return CONTACT_STATUSES.has(v) ? v : null;
}

/**
 * @returns {{ ok: true, patch: object } | { ok: false, error: string }}
 */
export function validateAdminContactPatch(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const patch = {};
  if (body.status !== undefined) {
    const st = normalizeContactStatus(body.status);
    if (!st) return { ok: false, error: 'Invalid status' };
    patch.status = st;
  }

  if (body.adminNotes !== undefined) {
    const notes = String(body.adminNotes ?? '').trim().slice(0, MAX_NOTES_LEN);
    patch.adminNotes = notes;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No valid fields to update' };
  }

  return { ok: true, patch };
}

/**
 * Admin sends a reply email to the contact address.
 * @returns {{ ok: true, data: { replyBody: string, adminNotes?: string } } | { ok: false, error: string }}
 */
export function validateContactReplySend(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const replyBody = String(body.replyBody ?? '').trim().slice(0, MAX_REPLY_EMAIL_LEN);
  if (!replyBody) {
    return { ok: false, error: 'Reply message is required' };
  }
  if (replyBody.length > MAX_REPLY_EMAIL_LEN) {
    return { ok: false, error: 'Reply message is too long' };
  }

  const data = { replyBody };
  if (body.adminNotes !== undefined) {
    data.adminNotes = String(body.adminNotes ?? '').trim().slice(0, MAX_NOTES_LEN);
  }

  return { ok: true, data };
}
