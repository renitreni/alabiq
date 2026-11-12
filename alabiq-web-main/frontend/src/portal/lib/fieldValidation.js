// Shared field validation for the auth screens. Companion to
// passwordValidation.js — same shape: a getXError(value) returning a message
// or null, so a caller can build a fieldErrors map without branching.

// Deliberately the same expression the backend enforces at the signup
// boundary (backend/lib/validate.js EMAIL_RE). If the two ever diverge the
// client accepts an address the server then rejects with a bare 400.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_EMAIL_LENGTH = 200;
export const MAX_NAME_LENGTH = 120;

export function getEmailError(email) {
  const value = String(email || '').trim();
  if (!value) return 'Email is required.';
  if (value.length > MAX_EMAIL_LENGTH) {
    return `Email must be at most ${MAX_EMAIL_LENGTH} characters.`;
  }
  if (!EMAIL_RE.test(value)) return 'Please enter a valid email address.';
  return null;
}

export function getRequiredError(value, label) {
  return String(value || '').trim() ? null : `${label} is required.`;
}

export function getNameError(value, label) {
  const name = String(value || '').trim();
  if (!name) return `${label} is required.`;
  if (name.length > MAX_NAME_LENGTH) {
    return `${label} must be at most ${MAX_NAME_LENGTH} characters.`;
  }
  return null;
}

// True when every value in a fieldErrors map is null/undefined.
export function isClean(errors) {
  return !Object.values(errors || {}).some(Boolean);
}
