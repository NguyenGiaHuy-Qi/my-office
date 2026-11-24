/**
 * Test 13: Concurrent Execution Test
 * Verifies maxConcurrent scheduling policy and parallel task execution.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkflows } from '../../server/workflows.mjs';

console.log('=== TEST 13: CONCURRENT EXECUTION TEST ===');

const testDir = path.resolve(process.cwd(), 'scratch', 'test-concurrency');
fs.mkdirSync(testDir, { recursive: true });
const storeFile = path.join(testDir, 'workflows.json');
try { fs.unlinkSync(storeFile); } catch {}
try { fs.unlinkSync(`${storeFile}.scheduler.lock`); } catch {}

let currentlyActive = 0;
let maxObservedActive = 0;
const completedOrder = [];

const scheduler = createWorkflows({
  file: storeFile,
  maxConcurrent: 2, // strictly max 2 parallel tasks
  dispatch: async (w, task) => {
    currentlyActive++;
    if (currentlyActive > maxObservedActive) {
      maxObservedActive = currentlyActive;
    }

    // Simulate async execution
    setTimeout(() => {
      currentlyActive--;
      completedOrder.push(task.id);
      scheduler.settle(w.id, task.id, { status: 'completed', result: `Done ${task.id}` });
    }, 150);

    return { ok: true, runId: `run_${task.id}` };
  },
});

console.log('--- 1. Submitting 4 Parallel Tasks with maxConcurrent: 2 ---');
const createRes = scheduler.create({
  name: 'Concurrent Batch Workflow',
  tasks: [
    { id: 'task-1', title: 'Task 1 (Antigravity)', provider: 'antigravity', priority: 1 },
    { id: 'task-2', title: 'Task 2 (Codex)', provider: 'codex-cli', priority: 1 },
    { id: 'task-3', title: 'Task 3 (Claude)', provider: 'claude-code', priority: 1 },
    { id: 'task-4', title: 'Task 4 (Antigravity QA)', provider: 'antigravity', priority: 1 },
  ],
});

const wfId = createRes.workflow.id;
scheduler.start(wfId);

// Wait for all 4 tasks to complete in waves of 2
console.log('--- 2. Awaiting Execution Waves ---');
await new Promise((resolve) => {
  const check = setInterval(() => {
    const wf = scheduler.get(wfId);
    if (wf && wf.status === 'completed') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});

console.log('- Completed Tasks:', completedOrder);
console.log('- Max Observed Active Tasks simultaneously:', maxObservedActive);

assert.equal(maxObservedActive, 2, 'Max concurrent running tasks must NOT exceed 2');
assert.equal(completedOrder.length, 4, 'All 4 tasks must complete');

const finalWf = scheduler.get(wfId);
assert.equal(finalWf.status, 'completed', 'Overall workflow must be completed');

scheduler.dispose();
console.log('\n[PASS] Test 13: Concurrent execution verified successfully!\n');
