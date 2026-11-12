// ---------------------------------------------------------------------
// Local development server.
// Run with:  npm run dev   (auto-restart)  or  npm start
//
// On Vercel this file is NOT used — api/index.js is the entrypoint there.
// ---------------------------------------------------------------------
require('dotenv').config(); // load .env BEFORE anything reads process.env
const {
  installConsoleCapture,
  installProcessHandlers,
  startErrorLogPruner,
} = require('./lib/errorLog');

// Before ./app, so console.error calls made while the modules load (config
// warnings, a failed client) are captured too.
installConsoleCapture();
installProcessHandlers();

const app = require('./app');
const { config } = require('./lib/config');
const { startDispatchSweeper } = require('./lib/dispatch');

const PORT = process.env.PORT || 4000;

// Loud safety net: auto-verify short-circuits real payment review and MUST be
// off in production. Surface it at boot so a mis-set .env can't hide.
if (config.autoVerifyTestMode) {
  console.warn(
    '[SECURITY] AUTO_VERIFY_STCPAY_TEST_MODE is ON — payment proofs auto-verify without review. ' +
      'This MUST be false in production.'
  );
}

app.listen(PORT, () => {
  console.log(`Alabiq API running on http://localhost:${PORT}`);
  // Grab-style dispatch: expire 30s driver offers and cascade to the next
  // driver. Long-running server only (Hostinger VPS / local); on serverless
  // there is no interval — jobs still surface via the open-pool fallback.
  startDispatchSweeper();
  startErrorLogPruner();
});
