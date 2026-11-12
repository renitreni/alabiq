export function getAuthErrorMessage(error) {
  const message = error?.message || '';
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return {
      field: 'password',
      text: 'The email or password you entered is incorrect. Please try again.',
    };
  }

  if (lower.includes('email not confirmed')) {
    return {
      field: 'email',
      text: 'Please confirm your email before signing in — check your inbox for the link we sent.',
    };
  }

  if (lower.includes('too many requests') || lower.includes('rate limit')) {
    return {
      field: 'banner',
      text: 'Too many attempts. Please wait a moment before trying again.',
    };
  }

  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return {
      field: 'banner',
      text: 'Network error: could not reach the server. Please check your connection.',
    };
  }

  // Fallback — still show something rather than swallow the error, but at
  // least strip Supabase's raw technical phrasing where possible.
  return {
    field: 'banner',
    text: message || 'Something went wrong. Please try again.',
  };
}