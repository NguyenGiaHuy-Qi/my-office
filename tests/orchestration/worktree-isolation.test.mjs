/**
 * Test 7: Worktree Isolation Test
 * Tests file and branch isolation between multiple concurrent worktrees.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

console.log('=== TEST 7: WORKTREE ISOLATION TEST ===');

const manager = new UniversalWorktreeManager();

console.log('--- 1. Creating Two Independent Workspaces ---');
const ws1 = await manager.createWorkspace({ taskId: 'iso_task_1', agentId: 'antigravity' });
const ws2 = await manager.createWorkspace({ taskId: 'iso_task_2', agentId: 'codex' });

console.log('- Workspace 1:', ws1.worktreePath);
console.log('- Workspace 2:', ws2.worktreePath);
assert.notEqual(ws1.worktreePath, ws2.worktreePath, 'Worktree paths must be distinct');
assert.notEqual(ws1.branch, ws2.branch, 'Branch names must be distinct');

console.log('\n--- 2. Writing Independent Files ---');
const file1 = path.join(ws1.worktreePath, 'module-alpha.txt');
fs.writeFileSync(file1, 'Alpha content from Agent 1', 'utf8');

const file2 = path.join(ws2.worktreePath, 'module-beta.txt');
fs.writeFileSync(file2, 'Beta content from Agent 2', 'utf8');

// Cross-workspace isolation assertions
assert.equal(fs.existsSync(file1), true, 'file1 must exist in workspace 1');
assert.equal(fs.existsSync(path.join(ws2.worktreePath, 'module-alpha.txt')), false, 'file1 must NOT exist in workspace 2');
assert.equal(fs.existsSync(path.join(process.cwd(), 'module-alpha.txt')), false, 'file1 must NOT exist in main repo');

assert.equal(fs.existsSync(file2), true, 'file2 must exist in workspace 2');
assert.equal(fs.existsSync(path.join(ws1.worktreePath, 'module-beta.txt')), false, 'file2 must NOT exist in workspace 1');
assert.equal(fs.existsSync(path.join(process.cwd(), 'module-beta.txt')), false, 'file2 must NOT exist in main repo');

console.log('\n--- 3. Verifying Git Status & Diff Independence ---');
const status1 = await manager.getGitStatus(ws1.worktreePath);
const status2 = await manager.getGitStatus(ws2.worktreePath);
console.log('- Workspace 1 Dirty Files:', status1.files.map((f) => f.file));
console.log('- Workspace 2 Dirty Files:', status2.files.map((f) => f.file));

assert.ok(status1.files.some((f) => f.file === 'module-alpha.txt'), 'Workspace 1 must contain module-alpha.txt');
assert.ok(!status1.files.some((f) => f.file === 'module-beta.txt'), 'Workspace 1 must NOT contain module-beta.txt');

assert.ok(status2.files.some((f) => f.file === 'module-beta.txt'), 'Workspace 2 must contain module-beta.txt');
assert.ok(!status2.files.some((f) => f.file === 'module-alpha.txt'), 'Workspace 2 must NOT contain module-alpha.txt');

console.log('\n--- 4. Cleaning Up Isolated Workspaces ---');
await manager.cleanupWorkspace('iso_task_1', { force: true });
await manager.cleanupWorkspace('iso_task_2', { force: true });

assert.equal(fs.existsSync(ws1.worktreePath), false, 'Workspace 1 directory must be deleted');
assert.equal(fs.existsSync(ws2.worktreePath), false, 'Workspace 2 directory must be deleted');

console.log('[PASS] Test 7: Worktree isolation verified successfully!\n');
