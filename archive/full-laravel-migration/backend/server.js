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
  // Schedulers (dispatch sweeper, preparing reminders, shop stale orders)
  // are owned by the worker process. The API server does NOT start them.
  startErrorLogPruner();
});
