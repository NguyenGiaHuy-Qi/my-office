/**
 * Master Test Runner for Phase 0 Universal Agent Orchestration.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const tests = [
  'tests/orchestration/discovery.test.mjs',
  'tests/orchestration/worktree.test.mjs',
  'tests/orchestration/headless-smoke.test.mjs',
  'tests/orchestration/streaming.test.mjs',
  'tests/orchestration/handoff.test.mjs',
];

console.log('================================================================');
console.log('  MY OFFICE UNIVERSAL AGENT ORCHESTRATION - PHASE 0 TEST SUITE  ');
console.log('================================================================\n');

let passed = 0;
let failed = 0;

for (const testFile of tests) {
  console.log(`>>> RUNNING: ${testFile}`);
  const start = Date.now();
  const res = spawnSync(process.execPath, [testFile], {
    stdio: 'inherit',
    windowsHide: true,
  });
  const duration = ((Date.now() - start) / 1000).toFixed(2);

  if (res.status === 0) {
    passed++;
    console.log(`[PASS] ${testFile} (${duration}s)\n`);
  } else {
    failed++;
    console.log(`[FAIL] ${testFile} (exit code ${res.status}, ${duration}s)\n`);
  }
}

console.log('================================================================');
console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${tests.length} tests.`);
console.log('================================================================');

process.exit(failed > 0 ? 1 : 0);

