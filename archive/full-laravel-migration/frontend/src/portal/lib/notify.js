// ---------------------------------------------------------------------
// User-facing alerts (SweetAlert2). Centralised so every error looks the
// same and QA can immediately see when something failed.
//
// notifyError is wired into the API client (api.js) so any failed request
// surfaces a popup automatically. Background/polling calls pass { silent }
// so they don't nag the user.
// ---------------------------------------------------------------------
import Swal from 'sweetalert2';
import { playAlert } from './alertSound';

const GENERIC_ERROR = 'Something went wrong on our side. Please try again in a moment.';

// Who is allowed to see diagnostic detail in a popup. Defaults to the SAFE
// answer (not an admin) so a message can never leak internals before the
// profile has loaded. AuthProvider keeps this in sync with the signed-in role.
let diagnosticsRole = null;
export function setDiagnosticsAudience(role) {
  diagnosticsRole = role || null;
}

// Text that means something to us and nothing to a customer: migration
// filenames, SQL/Postgres/Supabase internals, column and table names, stack
// noise. Showing any of it to an end user leaks our schema and deployment
// state, so non-admins get the generic line instead (the real message still
// goes to the console for QA).
const INTERNAL_MARKERS = [
  /migrations?\//i,
  /\.sql\b/i,
  /sql editor/i,
  /supabase/i,
  /postgres/i,
  /pgrst/i,
  /\brelation\b.*\bdoes not exist\b/i,
  /\bcolumn\b.*\bdoes not exist\b/i,
  /\bschema\b/i,
  /\bconstraint\b/i,
  /\bstack\b/i,
  /\bundefined is not\b/i,
  /\bnull is not\b/i,
  /\bECONN|ETIMEDOUT|ENOTFOUND\b/,
  /\bat .*\(.*:\d+:\d+\)/, // stack frame
];

function isSafeForAudience(message) {
  if (!message) return false;
  if (diagnosticsRole === 'admin') return true; // admins QA the app; let them see it
  return !INTERNAL_MARKERS.some((re) => re.test(message));
}

/**
 * Public-facing error popup. Business messages ("Minimum order is SAR 30")
 * pass through unchanged; anything that looks like internal diagnostics is
 * replaced with a generic line for non-admins.
 */
export function notifyError(message) {
  const safe = isSafeForAudience(message);
  if (!safe && message) {
    // Keep the detail reachable for whoever is debugging, just not on screen.
    console.error('[notifyError suppressed for non-admin]', message);
  }
  if (Swal.isVisible()) return;
  Swal.fire({
    icon: 'error',
    title: 'Oops...',
    text: safe ? message : GENERIC_ERROR,
  });
}

export function notifySuccess(title, text) {
  Swal.fire({
    icon: 'success',
    title: title || 'Done',
    text,
    timer: 2200,
    showConfirmButton: false,
  });
}

export function notifyWarning(title, text) {
  return Swal.fire({
    icon: 'warning',
    title,
    text,
    confirmButtonColor: '#FF7E21',
    confirmButtonText: 'OK',
  });
}

// requireText: for actions that cannot be undone, make the user type a word
// before Confirm does anything, so a mis-tap can never trigger it.
export async function confirmAction({
  title = 'Are you sure?',
  text,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  icon = 'warning',
  danger = false,
  requireText = null,
}) {
  const result = await Swal.fire({
    icon,
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: danger ? '#ef4444' : '#f97316',
    reverseButtons: true,
    focusCancel: true,
    ...(requireText
      ? {
          input: 'text',
          inputPlaceholder: requireText,
          inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
          preConfirm: (value) => {
            if ((value || '').trim().toUpperCase() !== requireText.toUpperCase()) {
              Swal.showValidationMessage(`Type ${requireText} to continue`);
              return false;
            }
            return true;
          },
        }
      : {}),
  });
  return result.isConfirmed;
}

// ---------------------------------------------------------------------
// Live ride alerts: a short chime + a corner toast. Used for "driver
// arrived" / "on the way to drop-off" style notifications (NOTES §5).
//
// The chime itself lives in alertSound.js. It used to be a second
// AudioContext right here, with no autoplay unlock, so every alert on this
// path was silently swallowed on a page the user had not clicked.
// ---------------------------------------------------------------------

export function notifyToast(title, opts = {}) {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: opts.icon || 'info',
    title,
    showConfirmButton: false,
    timer: opts.timer || 4000,
    timerProgressBar: true,
  });
}

// Chime + toast together — the "ring the bell" alert for ride events.
export function notifyAlert(title, opts = {}) {
  playAlert('chime');
  notifyToast(title, opts);
}

export function notifyUnderDevelopment() {
  Swal.fire({
    icon: 'info',
    title: 'Under Development',
    text: 'The Alabiq mobile application is currently under development. Check back soon!',
    showConfirmButton: false,
    timer: 2000,
  });
}

// Merchant-supplied text goes into a Swal `html` body, so it is escaped
// here. The reason is typed by a store owner and read by a customer — the
// one string on this screen that neither of them is trusted to author.
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * The store/restaurant withdrew an order it had already accepted.
 *
 * Shown once, as a modal rather than a toast, because it is the end of that
 * order and the customer has to acknowledge it — and because the refund
 * sentence is the part they will act on.
 *
 * `refundLabel` is passed ONLY when the order was actually paid. A cash
 * order was never collected, and promising a refund on one is a support
 * ticket we would have created ourselves.
 */
export function notifyMerchantCancelled({ noun = 'store', reason, refundLabel } = {}) {
  const lines = [
    `This is because ${escapeHtml(reason) || 'the items are no longer available'}.`,
    'We apologise for any inconvenience caused.',
    refundLabel
      ? `Your payment of <strong>${escapeHtml(refundLabel)}</strong> will be refunded — usually within a few hours, and up to one working day.`
      : null,
    `Try ordering again from a different ${escapeHtml(noun)} or at another time.`,
  ].filter(Boolean);

  return Swal.fire({
    icon: 'warning',
    title: `Sorry, the ${escapeHtml(noun)} cancelled your order`,
    html: lines.join('<br/><br/>'),
    confirmButtonText: 'OK',
    confirmButtonColor: '#FF7E21',
  });
}

/**
 * Ask a merchant why they are withdrawing an order they already accepted.
 *
 * A Swal input rather than window.prompt (which the reject buttons use)
 * because this reason is NOT optional: the server rejects an empty one, and
 * the customer reads it verbatim. Validating in the dialog beats a 400 the
 * merchant has to interpret.
 *
 * Resolves to the trimmed reason, or null if they backed out.
 */
export async function promptCancelReason({ orderCode, refundWarning } = {}) {
  const { value } = await Swal.fire({
    icon: 'warning',
    title: `Cancel order ${orderCode || ''}`.trim() + '?',
    html: [
      'The customer is told immediately and sees the reason you type below.',
      refundWarning
        ? 'This order is <strong>already paid</strong> — it will go into the refund queue for the platform to return the money.'
        : null,
    ]
      .filter(Boolean)
      .join('<br/><br/>'),
    input: 'text',
    inputPlaceholder: 'e.g. most items are no longer available',
    inputAttributes: { maxlength: 300 },
    inputValidator: (v) => (String(v || '').trim() ? undefined : 'Please give the customer a reason.'),
    showCancelButton: true,
    confirmButtonText: 'Cancel the order',
    cancelButtonText: 'Keep it',
    confirmButtonColor: '#dc2626',
  });
  const reason = String(value || '').trim();
  return reason || null;
}

/** Restaurant listed but menu not ready yet — stay on discovery. */
export function notifyMenuUnavailable(restaurantName) {
  return Swal.fire({
    icon: 'info',
    title: 'Menu not available yet',
    html: restaurantName
      ? `<strong>${restaurantName}</strong> is coming soon.<br/>Please wait while we finish adding their menu.`
      : 'This restaurant’s menu is not available yet. Please wait while we fix this.',
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
  });
}
