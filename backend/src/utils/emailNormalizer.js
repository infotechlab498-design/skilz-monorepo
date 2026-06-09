function splitEmailParts(raw) {
  const email = String(raw || '').trim().toLowerCase();
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex >= email.length - 1) {
    return null;
  }
  return {
    local: email.slice(0, atIndex),
    domain: email.slice(atIndex + 1),
  };
}

function stripPlusTag(localPart) {
  const plusIndex = localPart.indexOf('+');
  return plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
}

export function normalizeNewsletterEmail(rawEmail) {
  const parts = splitEmailParts(rawEmail);
  if (!parts) return String(rawEmail || '').trim().toLowerCase();

  let local = stripPlusTag(parts.local);
  const domain = parts.domain;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }

  return `${local}@${domain}`;
}
