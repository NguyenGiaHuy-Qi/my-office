/**
 * Test 12: Interrupted Workflow Recovery Test (Section E)
 * Tests persistence, server restart recovery, preserving worktrees on interruption,
 * task retrying, and fallback recovery from .bak file.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkflows } from '../../server/workflows.mjs';

console.log('=== TEST 12: INTERRUPTED WORKFLOW RECOVERY & PERSISTENCE ===');

const testDir = path.resolve(process.cwd(), 'scratch', 'test-recovery');
fs.mkdirSync(testDir, { recursive: true });
const storeFile = path.join(testDir, 'workflows.json');

try { fs.unlinkSync(storeFile); } catch {}
try { fs.unlinkSync(`${storeFile}.bak`); } catch {}
try { fs.unlinkSync(`${storeFile}.scheduler.lock`); } catch {}

// 1. First server session: create and start workflow
console.log('--- 1. Session 1: Starting Tasks in Background ---');
let s1 = createWorkflows({
  file: storeFile,
  dispatch: async (w, task) => {
    return {
      ok: true,
      runId: `run_${task.id}`,
      worktreePath: path.join(testDir, `wt-${task.id}`),
      branch: `orchestration/task-${task.id}`,
      pid: 12345,
    };
  },
});

const createRes = s1.create({
  name: 'Crash Recovery Workflow',
  tasks: [
    { id: 'task-crash-1', title: 'Task 1 to be interrupted', provider: 'antigravity', maxAttempts: 3 },
    { id: 'task-crash-2', title: 'Task 2 to be interrupted', provider: 'codex-cli', maxAttempts: 3 },
  ],
});

const wfId = createRes.workflow.id;
s1.start(wfId);

await new Promise((r) => setTimeout(r, 50));
let wf1 = s1.get(wfId);
assert.equal(wf1.status, 'running');
assert.equal(wf1.tasks[0].status, 'running');
console.log('- Tasks running with worktree:', wf1.tasks[0].worktreePath);

// Simulate server crash: release lock without settling running tasks
s1.dispose();

// 2. Second server session: restart and recovery
console.log('\n--- 2. Session 2: Server Restart & State Recovery ---');
let s2 = createWorkflows({
  file: storeFile,
  dispatch: async (w, task) => {
    return { ok: true, runId: `run_retry_${task.id}` };
  },
});

const recoveredWf = s2.get(wfId);
console.log('- Recovered Workflow Status:', recoveredWf.status);
console.log('- Task 1 Status:', recoveredWf.tasks[0].status);
console.log('- Task 1 Error:', recoveredWf.tasks[0].error);
console.log('- Task 1 Worktree Path Retained:', recoveredWf.tasks[0].worktreePath);

assert.equal(recoveredWf.status, 'interrupted', 'Workflow status must be interrupted');
assert.equal(recoveredWf.tasks[0].status, 'interrupted', 'Running task must be marked interrupted');
assert.ok(recoveredWf.tasks[0].error.includes('Server restarted'), 'Error must note server restart');
assert.ok(recoveredWf.tasks[0].worktreePath.includes('wt-task-crash-1'), 'Worktree path must NOT be deleted');

// 3. Test Retrying an Interrupted Task
console.log('\n--- 3. Retrying Interrupted Task ---');
const retryRes = s2.retry(wfId, 'task-crash-1');
console.log('- Retry Result:', retryRes.ok);
assert.equal(retryRes.ok, true);

await new Promise((r) => setTimeout(r, 50));
const afterRetry = s2.get(wfId);
console.log('- Task 1 Status after retry:', afterRetry.tasks[0].status);
assert.ok(['dispatching', 'running'].includes(afterRetry.tasks[0].status), 'Retried task must be running');
assert.equal(afterRetry.tasks[0].attempt, 2, 'Attempt count must increment to 2');

s2.dispose();

// 4. Test Corruption Recovery from .bak
console.log('\n--- 4. Testing Corrupted Primary File Recovery from .bak ---');
assert.equal(fs.existsSync(`${storeFile}.bak`), true, '.bak file must exist');

// Intentionally corrupt primary workflows.json
fs.writeFileSync(storeFile, '{ corrupted json ... truncated', 'utf8');

let s3 = createWorkflows({ file: storeFile });
const recoveredFromBak = s3.get(wfId);
assert.ok(recoveredFromBak, 'Workflow must be recovered from .bak file');
console.log('- Successfully recovered workflow from .bak backup:', recoveredFromBak.id);
s3.dispose();

console.log('\n[PASS] Test 12: Interrupted workflow recovery and persistence verified successfully!\n');
