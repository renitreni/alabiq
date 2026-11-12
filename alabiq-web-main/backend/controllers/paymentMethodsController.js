// ---------------------------------------------------------------------
// Saved payment methods — transport only.
//   - listPaymentMethods  : GET    /api/payment-methods
//   - deletePaymentMethod : DELETE /api/payment-methods/:id
//   - makeDefault         : POST   /api/payment-methods/:id/default
//
// Rules live in lib/savedCards.js, including the ownership check that every
// one of these depends on. Note there is NO "add a card" endpoint: on Tap a
// card can only be saved by completing a real charge with save_card, so
// there is no client-supplied card or token id anywhere in this file.
// ---------------------------------------------------------------------
const savedCards = require('../lib/savedCards');

async function listPaymentMethods(req, res) {
  try {
    // Drop anything Tap no longer recognises before answering, so the
    // picker never offers a card that would fail at charge time. Best
    // effort — a gateway blip must not turn "show my cards" into an error.
    await savedCards.reconcileWithGateway(req.userId).catch(() => {});
    const methods = await savedCards.listMethods(req.userId);
    return res.json({ methods });
  } catch (err) {
    console.error('listPaymentMethods error:', err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

async function deletePaymentMethod(req, res) {
  try {
    const removed = await savedCards.softDeleteMethod(req.userId, req.params.id);
    if (!removed) return res.status(404).json({ error: 'That payment method was not found' });
    return res.status(204).end();
  } catch (err) {
    console.error('deletePaymentMethod error:', err);
    return res.status(500).json({ error: 'Could not remove that payment method' });
  }
}

async function makeDefault(req, res) {
  try {
    const ok = await savedCards.setDefault(req.userId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'That payment method was not found' });
    const methods = await savedCards.listMethods(req.userId);
    return res.json({ methods });
  } catch (err) {
    console.error('makeDefault error:', err);
    return res.status(500).json({ error: 'Could not update your default card' });
  }
}

module.exports = { listPaymentMethods, deletePaymentMethod, makeDefault };
