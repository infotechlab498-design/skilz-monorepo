const PK_MOBILE_NATIONAL = /^3\d{9}$/;

/**
 * Converts Pakistan mobile to E.164 (+923001234567).
 * Accepts: `03XXXXXXXXX`, `+923XXXXXXXXX`, `923XXXXXXXXX`, `0092…`, optional spaces/dots/dashes.
 * @param {string} raw
 * @returns {string | null}
 */
export function pakistanLocalToE164(raw) {
    let t = String(raw || '')
        .trim()
        .replace(/[\s.-]/g, '');
    if (t.startsWith('00')) {
        t = `+${t.slice(2)}`;
    }
    if (t.startsWith('+92')) {
        const national = t.slice(3);
        return PK_MOBILE_NATIONAL.test(national) ? `+92${national}` : null;
    }
    if (t.startsWith('92') && t.length === 12) {
        const national = t.slice(2);
        return PK_MOBILE_NATIONAL.test(national) ? `+92${national}` : null;
    }
    if (/^03\d{9}$/.test(t)) {
        return `+92${t.slice(1)}`;
    }
    return null;
}

/**
 * Normalize stored E.164 (+923…) to form-style 03XXXXXXXXX for display/validation.
 * @param {string} raw
 * @returns {string}
 */
export function pakistanE164ToLocalDisplay(raw) {
    const t = String(raw || '')
        .trim()
        .replace(/[\s.-]/g, '');
    if (t.startsWith('+92') && t.length === 13 && /^\+923\d{9}$/.test(t)) {
        return `0${t.slice(3)}`;
    }
    if (/^03\d{9}$/.test(t)) return t;
    return String(raw || '').trim();
}
