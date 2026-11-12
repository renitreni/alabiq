// ---------------------------------------------------------------------
// Ledger math (spec §12). Pure functions — no database, no side effects.
//
// In the manual STC Pay flow the passenger pays Alabiq directly, so
// the platform collects the full fare and owes the driver their net share.
//
//   platform_commission = gross_fare * commissionRate
//   manual_payment_fee  = fixed processing cost
//   driver_net          = gross_fare - commission - manual_payment_fee
//   platform_net        = gross_fare - driver_net   (= commission + fee)
// ---------------------------------------------------------------------
const { config } = require('./config');
const ledgerRepository = require('../repositories/ledgerRepository');

const { round2 } = require('./money');

// grossFare: the booking's snapshot fare_amount.
// Overrides let callers (or tests) pin the rate/fee explicitly.
function computeLedger({ grossFare, commissionRate, manualPaymentFee } = {}) {
  const gross = round2(grossFare);
  const rate = commissionRate ?? config.ledger.commissionRate;
  const fee = round2(manualPaymentFee ?? config.ledger.manualPaymentFee);

  const platformCommission = round2(gross * rate);
  const driverGross = gross;
  const driverNet = round2(gross - platformCommission - fee);
  const platformNet = round2(gross - driverNet);

  return {
    gross_fare: gross,
    platform_commission: platformCommission,
    manual_payment_fee: fee,
    driver_gross: driverGross,
    driver_net: driverNet,
    platform_net: platformNet,
  };
}

// Create the ledger row for a completed booking (spec §12). Idempotent:
// if an entry already exists for this booking it is returned unchanged so
// a retried "complete ride" call never double-counts a payout.
//   booking: { id, fare_amount }
async function createLedgerEntryForBooking({ booking, driverId = null }) {
  const amounts = computeLedger({ grossFare: booking.fare_amount });
  // In test mode the payout is simulated (not real money) per the schema enum.
  const payoutStatus = config.autoVerifyTestMode ? 'simulated_test' : 'pending';

  try {
    return await ledgerRepository.createForBooking({
      bookingId: booking.id, driverId, amounts, payoutStatus,
    });
  } catch (error) {
    return { error };
  }
}

module.exports = { computeLedger, round2, createLedgerEntryForBooking };
