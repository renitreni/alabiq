const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  pushConfig,
  registerToken,
  unregisterToken,
  listMyNotifications,
  markAllRead,
} = require('../controllers/notificationsController');

// Public VAPID key only (the private key never leaves the backend).
router.get('/push-config', requireAuth, pushConfig);
// Register / refresh this device's push token (called after login on the app).
router.post('/register', requireAuth, registerToken);
// Remove a device token (called on logout).
router.post('/unregister', requireAuth, unregisterToken);
// A user's own notification history.
router.get('/', requireAuth, listMyNotifications);
router.patch('/read', requireAuth, markAllRead);

module.exports = router;
