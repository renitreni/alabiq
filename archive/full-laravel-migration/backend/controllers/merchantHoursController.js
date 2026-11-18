// ---------------------------------------------------------------------
// Opening hours + "closed now" endpoints, shared by both verticals and by
// both audiences:
//
//   admin*  -> operates on :id from the URL, already behind requireAdmin.
//   owner*  -> operates on the merchant the caller owns, resolved from the
//              session. The id is never taken from the request, so an owner
//              cannot set another merchant's hours.
//
// Business rules live in lib/merchantHours.js; this file is transport only.
// ---------------------------------------------------------------------
const database = require('../lib/database/pool');
const { listHours, replaceHours, setAcceptingOrders } = require('../lib/merchantHours');
const { logAudit } = require('../lib/audit');

async function loadMerchant(id) {
  const { rows } = await database.query(
    'SELECT id,name,vertical,accepting_orders FROM public.merchants WHERE id=$1 LIMIT 1', [id]);
  return rows[0] || null;
}

// merchants.owner_id is unique (0009), so one owner resolves to one merchant
// across both verticals.
async function loadOwnedMerchant(ownerId) {
  const { rows } = await database.query(
    'SELECT id,name,vertical,accepting_orders FROM public.merchants WHERE owner_id=$1 LIMIT 1', [ownerId]);
  return rows[0] || null;
}

async function respondWithHours(res, merchant) {
  const hours = await listHours(merchant.id);
  return res.json({ acceptingOrders: merchant.accepting_orders !== false, hours });
}

function handleError(res, err, what) {
  console.error(`${what} error:`, err.message || err);
  return res.status(500).json({ error: `Could not ${what}` });
}

// --- Admin -----------------------------------------------------------
async function adminGetHours(req, res) {
  try {
    const merchant = await loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    return respondWithHours(res, merchant);
  } catch (err) {
    return handleError(res, err, 'load the opening hours');
  }
}

async function adminSetHours(req, res) {
  try {
    const merchant = await loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const result = await replaceHours(merchant.id, req.body.hours);
    if (!result.ok) return res.status(400).json({ error: result.error });

    logAudit({
      actorId: req.adminId,
      action: 'merchant_hours_set',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { vertical: merchant.vertical, windows: result.rows.length },
    });
    return respondWithHours(res, merchant);
  } catch (err) {
    return handleError(res, err, 'save the opening hours');
  }
}

async function adminSetAccepting(req, res) {
  try {
    const merchant = await loadMerchant(req.params.id);
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

    const accepting = !!req.body.accepting_orders;
    await setAcceptingOrders(merchant.id, accepting);
    logAudit({
      actorId: req.adminId,
      action: accepting ? 'merchant_reopened' : 'merchant_closed_now',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { vertical: merchant.vertical },
    });
    return respondWithHours(res, { ...merchant, accepting_orders: accepting });
  } catch (err) {
    return handleError(res, err, 'update the open state');
  }
}

// --- Owner -----------------------------------------------------------
async function ownerGetHours(req, res) {
  try {
    const merchant = await loadOwnedMerchant(req.merchantOwnerId);
    if (!merchant) return res.status(404).json({ error: 'No merchant is linked to this account' });
    return respondWithHours(res, merchant);
  } catch (err) {
    return handleError(res, err, 'load the opening hours');
  }
}

async function ownerSetHours(req, res) {
  try {
    const merchant = await loadOwnedMerchant(req.merchantOwnerId);
    if (!merchant) return res.status(404).json({ error: 'No merchant is linked to this account' });

    const result = await replaceHours(merchant.id, req.body.hours);
    if (!result.ok) return res.status(400).json({ error: result.error });

    logAudit({
      actorId: req.merchantOwnerId,
      action: 'merchant_hours_set_by_owner',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { vertical: merchant.vertical, windows: result.rows.length },
    });
    return respondWithHours(res, merchant);
  } catch (err) {
    return handleError(res, err, 'save the opening hours');
  }
}

async function ownerSetAccepting(req, res) {
  try {
    const merchant = await loadOwnedMerchant(req.merchantOwnerId);
    if (!merchant) return res.status(404).json({ error: 'No merchant is linked to this account' });

    const accepting = !!req.body.accepting_orders;
    await setAcceptingOrders(merchant.id, accepting);
    logAudit({
      actorId: req.merchantOwnerId,
      action: accepting ? 'merchant_reopened_by_owner' : 'merchant_closed_now_by_owner',
      resourceType: 'merchant',
      resourceId: merchant.id,
      meta: { vertical: merchant.vertical },
    });
    return respondWithHours(res, { ...merchant, accepting_orders: accepting });
  } catch (err) {
    return handleError(res, err, 'update the open state');
  }
}

module.exports = {
  adminGetHours,
  adminSetHours,
  adminSetAccepting,
  ownerGetHours,
  ownerSetHours,
  ownerSetAccepting,
};
