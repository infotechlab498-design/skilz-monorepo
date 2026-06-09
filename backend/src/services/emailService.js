import crypto from 'crypto';

function getMailchimpConfig() {
  const apiKey = String(process.env.MAILCHIMP_API_KEY || '').trim();
  const listId = String(process.env.MAILCHIMP_LIST_ID || '').trim();
  const serverPrefix = String(process.env.MAILCHIMP_SERVER_PREFIX || '').trim();
  return { apiKey, listId, serverPrefix };
}

function isMailchimpConfigured() {
  const { apiKey, listId, serverPrefix } = getMailchimpConfig();
  return Boolean(apiKey && listId && serverPrefix);
}

function mailchimpBaseUrl(serverPrefix) {
  return `https://${serverPrefix}.api.mailchimp.com/3.0`;
}

function shouldRetry(responseStatus, attempt) {
  if (attempt >= 1) return false;
  return responseStatus === 429 || responseStatus >= 500;
}

async function parseJsonSafe(response) {
  return response.json().catch(() => ({}));
}

async function parseTextSafe(response) {
  return response.text().catch(() => '');
}

function truncate(value, maxLen = 400) {
  const str = String(value || '');
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}

async function mailchimpFetchWithRetry(endpoint, options) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, options);
      if (shouldRetry(response.status, attempt)) {
        console.error('[mailchimp] transient failure, retrying', {
          status: response.status,
          endpoint,
          attempt: attempt + 1,
        });
        continue;
      }
      return response;
    } catch (error) {
      if (attempt >= 1) throw error;
      console.error('[mailchimp] network error, retrying', {
        endpoint,
        attempt: attempt + 1,
        message: error?.message || String(error),
      });
    }
  }
  throw new Error('mailchimp_request_failed_after_retry');
}

function subscriberHash(email) {
  return crypto.createHash('md5').update(String(email || '').toLowerCase()).digest('hex');
}

function mailchimpHeaders(apiKey) {
  return {
    Authorization: `apikey ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function subscribeEmailToEsp(email) {
  if (!isMailchimpConfigured()) {
    return { ok: false, skipped: true, errorMessage: 'mailchimp_not_configured' };
  }

  const { apiKey, listId, serverPrefix } = getMailchimpConfig();
  const endpoint = `${mailchimpBaseUrl(serverPrefix)}/lists/${encodeURIComponent(listId)}/members`;

  try {
    const response = await mailchimpFetchWithRetry(endpoint, {
      method: 'POST',
      headers: mailchimpHeaders(apiKey),
      body: JSON.stringify({
        email_address: email,
        status: 'subscribed',
      }),
    });

    if (response.status === 400) {
      const body = await parseJsonSafe(response);
      if (String(body?.title || '').toLowerCase() === 'member exists') {
        return { ok: true, duplicate: true };
      }
    }

    if (!response.ok) {
      const text = truncate(await parseTextSafe(response));
      console.error('[mailchimp] subscribe failed', {
        status: response.status,
        endpoint,
        details: text,
      });
      return { ok: false, errorMessage: `mailchimp_subscribe_failed_${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error('[mailchimp] subscribe exception', {
      endpoint,
      message: error?.message || String(error),
    });
    return { ok: false, errorMessage: 'mailchimp_subscribe_exception' };
  }
}

export async function unsubscribeEmailFromEsp(email) {
  if (!isMailchimpConfigured()) {
    return { ok: false, skipped: true, errorMessage: 'mailchimp_not_configured' };
  }

  const { apiKey, listId, serverPrefix } = getMailchimpConfig();
  const emailHash = subscriberHash(email);
  const endpoint = `${mailchimpBaseUrl(serverPrefix)}/lists/${encodeURIComponent(
    listId
  )}/members/${emailHash}`;

  try {
    const response = await mailchimpFetchWithRetry(endpoint, {
      method: 'DELETE',
      headers: mailchimpHeaders(apiKey),
    });

    // 404 means member already absent; consider this successful unsubscribe.
    if (response.status === 404) {
      return { ok: true, alreadyAbsent: true };
    }

    if (!response.ok) {
      const text = truncate(await parseTextSafe(response));
      console.error('[mailchimp] unsubscribe failed', {
        status: response.status,
        endpoint,
        details: text,
      });
      return { ok: false, errorMessage: `mailchimp_unsubscribe_failed_${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    console.error('[mailchimp] unsubscribe exception', {
      endpoint,
      message: error?.message || String(error),
    });
    return { ok: false, errorMessage: 'mailchimp_unsubscribe_exception' };
  }
}
