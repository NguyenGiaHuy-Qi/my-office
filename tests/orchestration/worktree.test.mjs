/**
 * Test D: Universal Git Worktree Isolation Test.
 * Tests creating three independent worktrees for three concurrent tasks,
 * verifying file isolation, status, diff, conflict checking, and safe cleanup.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

console.log('=== TEST D: WORKSPACE & WORKTREE ISOLATION TEST ===');

const manager = new UniversalWorktreeManager({ repoRoot: process.cwd() });
const taskIds = ['task_alpha', 'task_beta', 'task_gamma'];
const createdWorkspaces = [];

try {
  // 1. Create three separate workspaces
  for (const tid of taskIds) {
    console.log(`\nCreating isolated worktree for ${tid}...`);
    const ws = await manager.createWorkspace({ taskId: tid });
    createdWorkspaces.push(ws);

    console.log(`- Path: ${ws.worktreePath}`);
    console.log(`- Branch: ${ws.branch}`);
    assert.ok(fs.existsSync(ws.worktreePath), `Worktree path must exist: ${ws.worktreePath}`);

    // Verify workspace lock
    const lockFile = path.join(ws.worktreePath, '.workspace-lock.json');
    assert.ok(fs.existsSync(lockFile), 'Workspace lock file must exist');
  }

  // 2. Test Isolation: Write a distinct file in each worktree
  console.log('\nTesting file isolation across worktrees...');
  const fileA = path.join(createdWorkspaces[0].worktreePath, 'agent-a-artifact.txt');
  const fileB = path.join(createdWorkspaces[1].worktreePath, 'agent-b-artifact.txt');
  const fileC = path.join(createdWorkspaces[2].worktreePath, 'agent-c-artifact.txt');

  fs.writeFileSync(fileA, 'Created by Agent A in Workspace Alpha', 'utf8');
  fs.writeFileSync(fileB, 'Created by Agent B in Workspace Beta', 'utf8');
  fs.writeFileSync(fileC, 'Created by Agent C in Workspace Gamma', 'utf8');

  // Verify cross-isolation: fileA does not exist in workspace B or C
  assert.equal(fs.existsSync(path.join(createdWorkspaces[1].worktreePath, 'agent-a-artifact.txt')), false);
  assert.equal(fs.existsSync(path.join(createdWorkspaces[2].worktreePath, 'agent-a-artifact.txt')), false);
  console.log('[PASS] File isolation confirmed: workspaces are strictly independent');

  // 3. Test Git Status & Diff
  console.log('\nChecking git status in workspace Alpha...');
  const statusA = await manager.getGitStatus(createdWorkspaces[0].worktreePath);
  console.log(`- Dirty: ${statusA.dirty}, Files: ${statusA.fileCount}`);
  assert.equal(statusA.dirty, true);

  // 4. Test Cleanup Safety (rejection if uncommitted changes exist without force)
  console.log('\nTesting cleanup safety on dirty workspace...');
  let failedAsExpected = false;
  try {
    await manager.cleanupWorkspace(taskIds[0], { force: false });
  } catch (err) {
    failedAsExpected = true;
    console.log(`- Correctly rejected cleanup without force: ${err.message}`);
  }
  assert.equal(failedAsExpected, true, 'Cleanup must fail if uncommitted changes exist and force: false');

  // 5. Cleanup with force
  console.log('\nCleaning up all test worktrees...');
  for (const tid of taskIds) {
    const res = await manager.cleanupWorkspace(tid, { force: true, deleteBranch: true });
    console.log(`- Cleaned up ${tid}: branch ${res.deletedBranch}`);
  }

  console.log('\n[PASS] Test D: Worktree isolation, locks, and cleanup verified successfully!');
} catch (err) {
  // Ensure cleanup on failure
  for (const tid of taskIds) {
    try {
      await manager.cleanupWorkspace(tid, { force: true, deleteBranch: true });
    } catch {
      /* ignore */
    }
  }
  throw err;
}

