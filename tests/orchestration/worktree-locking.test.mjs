/**
 * Test 8: Worktree Locking & Guard Test
 * Tests concurrency locking, ownership enforcement, and safe cleanup guards.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

console.log('=== TEST 8: WORKTREE LOCKING & GUARD TEST ===');

const manager = new UniversalWorktreeManager();

// 1. Create workspace
console.log('--- 1. Creating Locked Workspace ---');
const ws = await manager.createWorkspace({
  taskId: 'lock_guard_task',
  agentId: 'antigravity',
  baseBranch: 'HEAD',
});

console.log('- Worktree Path:', ws.worktreePath);
const lockFile = path.join(ws.worktreePath, '.workspace-lock.json');
assert.equal(fs.existsSync(lockFile), true, '.workspace-lock.json must exist');

const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
console.log('- Lock Metadata:', lockData);
assert.equal(lockData.taskId, 'lock_guard_task');
assert.equal(lockData.active, true);
assert.equal(lockData.pid, process.pid);
assert.ok(lockData.baseCommit, 'Lock must record baseCommit');

// 2. Test concurrent lock acquisition rejection
console.log('\n--- 2. Testing Lock Conflict Rejection ---');
let conflictCaught = false;
try {
  await manager.createWorkspace({
    taskId: 'lock_guard_task',
    agentId: 'another_agent',
  });
} catch (err) {
  conflictCaught = true;
  console.log('- Successfully rejected concurrent lock:', err.message);
  assert.ok(err.message.includes('already locked'), 'Error message must specify locked status');
}
assert.equal(conflictCaught, true, 'Lock collision must be rejected');

// 3. Test cleanup rejection while locked and dirty
console.log('\n--- 3. Testing Cleanup Guard ---');
const dummyEdit = path.join(ws.worktreePath, 'agent-scratch.txt');
fs.writeFileSync(dummyEdit, 'uncommitted agent code');

let cleanupBlocked = false;
try {
  // Attempt cleanup without force while locked
  await manager.cleanupWorkspace('lock_guard_task', { force: false });
} catch (err) {
  cleanupBlocked = true;
  console.log('- Successfully blocked cleanup:', err.message);
  assert.ok(
    err.message.includes('active task') || err.message.includes('uncommitted change'),
    'Cleanup must be blocked by lock or dirty files'
  );
}
assert.equal(cleanupBlocked, true, 'Cleanup must be blocked when locked without force');

// 4. Unlock and cleanup
console.log('\n--- 4. Unlocking and Cleaning Up ---');
manager.unlockWorkspace(ws.worktreePath);
const cleanRes = await manager.cleanupWorkspace('lock_guard_task', { force: true });
assert.ok(cleanRes.ok, 'Forced cleanup after task completion must succeed');
assert.equal(fs.existsSync(ws.worktreePath), false, 'Workspace must be removed');

console.log('[PASS] Test 8: Worktree locking and guards verified successfully!\n');
