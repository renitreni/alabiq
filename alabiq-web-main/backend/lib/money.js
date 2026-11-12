// ---------------------------------------------------------------------
// The one rounding rule for money. Half-up, applied once at the money
// boundary -- never per line, never twice on the same figure.
//
// This replaces six identical copies of
//
//     Math.round((n + Number.EPSILON) * 100) / 100
//
// which look half-up but are not. Number.EPSILON is the gap between 1.0 and
// the next representable double; above roughly 2.0 it is SMALLER than the
// representation error it was added to cancel, so the nudge stops working
// exactly where money amounts live. Concretely: a 50.50 base at 15% VAT is
// 7.5750 and that idiom returned 7.57, not 7.58. It skews consistently
// DOWN, so the platform under-collected VAT while still owing ZATCA the
// exact figure.
//
// 1e-9 is an absolute nudge rather than a relative one, so it keeps working
// across the whole range of amounts this app handles. Sign is taken out
// first because Math.round breaks ties toward +Infinity, which would round
// a refund of -0.005 to -0.00 instead of -0.01.
// ---------------------------------------------------------------------

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  // The trailing `+ 0` normalises -0 to 0. Without it a negative that
  // rounds away to nothing comes back as -0, and (-0).toFixed(2) renders
  // "-0.00" -- so a zero-value refund or adjustment prints as minus zero
  // on a customer receipt.
  return (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-9)) / 100 + 0;
}

module.exports = { round2 };
