// ---------------------------------------------------------------------
// Bounded fetch.
//
// Nothing in this process used to have a timeout, and that is a different
// risk here than on a horizontally scaled app: one PM2 process, no queue,
// no bulkhead. A dependency that is SLOW rather than down is the dangerous
// case, because every hung promise keeps holding its Express handler and
// its pooler slot while setInterval keeps firing fresh sweeper runs on top.
//
// Note this bounds a stalled connection, not total transfer time of a
// legitimately large response -- which is the right trade for JSON APIs.
// ---------------------------------------------------------------------

function fetchWithTimeout(ms) {
  return (url, options = {}) =>
    fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(ms) });
}

module.exports = { fetchWithTimeout };
