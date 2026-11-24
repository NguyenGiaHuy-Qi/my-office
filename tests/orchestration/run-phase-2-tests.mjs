/**
 * Master Test Suite for Phase 2: Universal Agent Orchestration
 * Runs all 13 required verification tests.
 */

import { execFile } from 'node:child_process';
import path from 'node:path';

const tests = [
  { id: 1, file: 'tests/orchestration/workflow-lifecycle.test.mjs', desc: 'Workflow lifecycle test' },
  { id: 2, file: 'tests/orchestration/antigravity-execution.test.mjs', desc: 'Antigravity execution test' },
  { id: 3, file: 'tests/orchestration/claude-execution.test.mjs', desc: 'Claude execution test' },
  { id: 4, file: 'tests/orchestration/codex-execution.test.mjs', desc: 'Codex execution test' },
  { id: 5, file: 'tests/orchestration/three-provider-registry.test.mjs', desc: 'Three-provider registry test' },
  { id: 6, file: 'tests/orchestration/dirty-repo-preservation.test.mjs', desc: 'Dirty repository preservation test' },
  { id: 7, file: 'tests/orchestration/worktree-isolation.test.mjs', desc: 'Worktree isolation test' },
  { id: 8, file: 'tests/orchestration/worktree-locking.test.mjs', desc: 'Worktree locking test' },
  { id: 9, file: 'tests/orchestration/handoff-contract.test.mjs', desc: 'Handoff contract test' },
  { id: 10, file: 'tests/orchestration/secret-redaction.test.mjs', desc: 'Secret redaction test' },
  { id: 11, file: 'tests/orchestration/cancellation.test.mjs', desc: 'Process cancellation test' },
  { id: 12, file: 'tests/orchestration/interrupted-recovery.test.mjs', desc: 'Interrupted workflow recovery test' },
  { id: 13, file: 'tests/orchestration/concurrent-execution.test.mjs', desc: 'Concurrent execution test' },
  { id: 14, file: 'tests/orchestration/merge-conflict-detection.test.mjs', desc: 'Merge conflict detection test' },
];

console.log('================================================================');
console.log('  MY OFFICE UNIVERSAL AGENT ORCHESTRATION - PHASE 2 TEST SUITE  ');
console.log('================================================================\n');

let passed = 0;
let failed = 0;
const results = [];

for (const t of tests) {
  const start = Date.now();
  console.log(`>>> RUNNING [${t.id}/13]: ${t.desc} (${t.file})`);

  await new Promise((resolve) => {
    execFile(
      process.execPath,
      [path.resolve(process.cwd(), t.file)],
      { cwd: process.cwd(), timeout: 90000, windowsHide: true },
      (err, stdout, stderr) => {
        const duration = ((Date.now() - start) / 1000).toFixed(2);
        if (err) {
          console.error(`[FAIL] ${t.file} (${duration}s)`);
          console.error(stdout);
          console.error(stderr || err.message);
          failed++;
          results.push({ ...t, ok: false, duration, error: err.message });
        } else {
          console.log(stdout.trim());
          console.log(`[PASS] ${t.file} (${duration}s)\n`);
          passed++;
          results.push({ ...t, ok: true, duration });
        }
        resolve();
      }
    );
  });
}

console.log('================================================================');
console.log(`FINAL SUMMARY: ${passed} PASSED, ${failed} FAILED out of ${tests.length} tests.`);
console.log('================================================================');

for (const r of results) {
  console.log(`- Test ${r.id.toString().padStart(2, ' ')}: [${r.ok ? 'PASS' : 'FAIL'}] ${r.desc} (${r.duration}s)`);
}

if (failed > 0) {
  process.exit(1);
}
