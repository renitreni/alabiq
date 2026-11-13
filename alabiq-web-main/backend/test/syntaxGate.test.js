'use strict';

// Syntax gate: every runtime JS file must parse. Catches truncated files
// that unit tests never load (e.g. deliveriesController.js shipped broken
// in Phase 6 — the API container crash-looped on boot while tests stayed green).

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND_ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['controllers', 'routes', 'lib', 'middleware'];

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

for (const dir of SCAN_DIRS) {
  const root = path.join(BACKEND_ROOT, dir);
  for (const file of collectJsFiles(root)) {
    const rel = path.relative(BACKEND_ROOT, file);
    test(`parses: ${rel}`, () => {
      assert.doesNotThrow(
        () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
        `${rel} has a syntax error (truncated file?)`,
      );
    });
  }
}
