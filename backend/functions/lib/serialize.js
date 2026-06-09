function serializeValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object' && typeof v.toMillis === 'function') {
    return v.toMillis();
  }
  if (Array.isArray(v)) {
    return v.map(serializeValue);
  }
  if (typeof v === 'object' && v.constructor?.name === 'DocumentReference') {
    return String(v.path);
  }
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = serializeValue(val);
    }
    return out;
  }
  return v;
}

function plainData(data) {
  if (!data || typeof data !== 'object') return {};
  return serializeValue(data);
}

module.exports = { serializeValue, plainData };
