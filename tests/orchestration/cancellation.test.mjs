/**
 * Test 11: Process Cancellation Test
 * Tests graceful and forceful process cancellation through adapters and workflow scheduler.
 */

import assert from 'node:assert/strict';
import { createWorkflows } from '../../server/workflows.mjs';
import { BaseAgentAdapter, killProcessTree } from '../../server/orchestration/adapters/base-agent-adapter.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

console.log('=== TEST 11: PROCESS CANCELLATION TEST ===');

// 1. Test killProcessTree on a spawned long-running child
console.log('--- 1. Testing killProcessTree on Windows Process Tree ---');
const isWin = process.platform === 'win32';
const sleepCmd = isWin ? 'powershell' : 'sleep';
const sleepArgs = isWin ? ['-NoProfile', '-Command', 'Start-Sleep -Seconds 60'] : ['60'];

const child = spawn(sleepCmd, sleepArgs, { windowsHide: true });
const childPid = child.pid;
console.log(`- Spawned background process with PID: ${childPid}`);
assert.ok(childPid > 0, 'Child process must have valid PID');

// Ensure process is running
await new Promise((r) => setTimeout(r, 200));

// Kill process tree
killProcessTree(childPid);

// Verify process is terminated
await new Promise((r) => setTimeout(r, 400));
let stillAlive = false;
try {
  process.kill(childPid, 0);
  stillAlive = true;
} catch {
  stillAlive = false;
}
console.log(`- Process ${childPid} alive status after kill: ${stillAlive}`);
assert.equal(stillAlive, false, 'Process tree must be terminated');

// 2. Test Workflow Task Cancellation
console.log('\n--- 2. Testing Workflow Task Cancellation ---');
const testDir = path.resolve(process.cwd(), 'scratch', 'test-cancellation');
fs.mkdirSync(testDir, { recursive: true });
const storeFile = path.join(testDir, 'workflows.json');
try { fs.unlinkSync(storeFile); } catch {}
try { fs.unlinkSync(`${storeFile}.scheduler.lock`); } catch {}

let cancelledRunId = null;
const scheduler = createWorkflows({
  file: storeFile,
  dispatch: async (w, task) => {
    return { ok: true, runId: `run_${task.id}`, pid: childPid };
  },
  cancel: (provider, runId) => {
    cancelledRunId = runId;
    return true;
  },
});

const createRes = scheduler.create({
  name: 'Cancel Test Workflow',
  tasks: [
    { id: 'task-long', title: 'Long Running Task', provider: 'antigravity' },
  ],
});

const wfId = createRes.workflow.id;
scheduler.start(wfId);

await new Promise((r) => setTimeout(r, 50));
let wf = scheduler.get(wfId);
assert.equal(wf.tasks[0].status, 'running');

// Cancel task
const cancelRes = scheduler.cancelTask(wfId, 'task-long');
console.log('- Cancel Task Result:', cancelRes);
assert.equal(cancelRes.ok, true);

assert.equal(cancelledRunId, 'run_task-long', 'Scheduler must invoke provider cancel hook');

scheduler.settle(wfId, 'task-long', { status: 'cancelled' });
wf = scheduler.get(wfId);
console.log('- Task status after cancel settlement:', wf.tasks[0].status);
assert.equal(wf.tasks[0].status, 'cancelled');
assert.equal(wf.status, 'cancelled');

scheduler.dispose();
console.log('\n[PASS] Test 11: Process and task cancellation verified successfully!\n');
