export const MIN_PASSWORD_LENGTH = 8;

const HAS_NUMBER = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;
const HAS_LOWER = /[a-z]/;
const HAS_UPPER = /[A-Z]/;

export function hasMinLength(password) {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function hasNumberOrSpecial(password) {
  return HAS_NUMBER.test(password) || HAS_SPECIAL.test(password);
}

export function isPasswordValid(password) {
  return hasMinLength(password) && hasNumberOrSpecial(password);
}

export function passwordsMatch(password, confirmPassword) {
  return password === confirmPassword && confirmPassword.length > 0;
}

export function getPasswordValidationError(password) {
  if (!hasMinLength(password)) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!hasNumberOrSpecial(password)) {
    return 'Password must include at least one number or special character.';
  }
  return null;
}

/** @returns {'weak' | 'medium' | 'strong' | null} */
export function getPasswordStrength(password) {
  if (!password) return null;
  if (!isPasswordValid(password)) return 'weak';

  let score = 0;
  if (password.length >= 10) score += 1;
  if (password.length >= 12) score += 1;
  if (HAS_NUMBER.test(password)) score += 1;
  if (HAS_SPECIAL.test(password)) score += 1;
  if (HAS_LOWER.test(password)) score += 1;
  if (HAS_UPPER.test(password)) score += 1;

  if (score >= 4) return 'strong';
  if (score >= 2) return 'medium';
  return 'weak';
}

export const PASSWORD_STRENGTH_LABELS = {
  weak: 'Weak',
  medium: 'Medium',
  strong: 'Strong',
};

export const PASSWORD_STRENGTH_COLORS = {
  weak: 'bg-red-500',
  medium: 'bg-amber-500',
  strong: 'bg-green-500',
};

export const PASSWORD_STRENGTH_TEXT = {
  weak: 'text-red-600',
  medium: 'text-amber-600',
  strong: 'text-green-600',
};
