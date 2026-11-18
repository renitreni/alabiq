// ---------------------------------------------------------------------
// Vercel serverless entrypoint.
//
// vercel.json rewrites every request to "/api/index", and Vercel runs
// this file as a serverless function. Express then handles routing
// exactly as it does locally. (On Vercel, environment variables come
// from the Vercel dashboard, so dotenv simply does nothing there.)
// ---------------------------------------------------------------------
require('dotenv').config();
const app = require('../app');

module.exports = app;
