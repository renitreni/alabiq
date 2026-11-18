// ---------------------------------------------------------------------
// Popup presentation of the legal documents via SweetAlert2, so Privacy and
// Terms can be opened from the booking consent line without leaving a
// half-filled form. The copy itself lives in ./legalContent.js and
// is shared with the /privacy-policy and /terms-of-service routes.
// ---------------------------------------------------------------------
import Swal from 'sweetalert2';
import { LEGAL_DOCS } from './legalContent';

// kind: 'privacy' | 'terms'
export function openLegalModal(kind) {
  const c = LEGAL_DOCS[kind];
  if (!c) return;
  Swal.fire({
    title: c.title,
    html: c.html,
    width: '44rem',
    showCloseButton: true,
    confirmButtonText: 'Close',
    confirmButtonColor: '#FF7E21',
    scrollbarPadding: false,
  });
}
