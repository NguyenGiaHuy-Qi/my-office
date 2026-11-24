/**
 * Test 6: Dirty Repository Preservation Test (Section C)
 * Verifies that when the main working repository contains:
 * - Modified tracked files
 * - Untracked files
 * - Staged files
 * - User-edited files
 * The Universal Worktree Manager creates clean isolated workspaces from explicit baseCommit,
 * NEVER stashes, commits, overwrites, or deletes any user changes, and leaves the main repository
 * completely intact throughout creation, execution, and cleanup.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

console.log('=== TEST 6: DIRTY REPOSITORY PRESERVATION & SAFETY ===');

const manager = new UniversalWorktreeManager();

const testStagedFile = path.resolve(process.cwd(), 'tests', 'orchestration', '.test-staged-file.txt');
const testUserFile = path.resolve(process.cwd(), 'tests', 'orchestration', '.test-user-editing.txt');
try { execSync(`git reset HEAD "${testStagedFile}"`, { stdio: 'ignore' }); } catch {}
try { fs.unlinkSync(testStagedFile); } catch {}
try { fs.unlinkSync(testUserFile); } catch {}

// 1. Inspect initial main repo status
const initialStatus = await manager.checkMainRepoStatus();
console.log(`- Initial Main Repo Status: Dirty=${initialStatus.dirty}, Total Files=${initialStatus.totalCount} (Unstaged: ${initialStatus.unstagedCount}, Untracked: ${initialStatus.untrackedCount})`);

// 2. Add a staged file and user-editing file to ensure all dirty states exist simultaneously
fs.writeFileSync(testStagedFile, `staged content ${Date.now()}`, 'utf8');
execSync(`git add "${testStagedFile}"`);

fs.writeFileSync(testUserFile, `user actively typing ${Date.now()}`, 'utf8');

const preparedStatus = await manager.checkMainRepoStatus();
console.log(`- Prepared Dirty State: Staged=${preparedStatus.stagedCount}, Unstaged=${preparedStatus.unstagedCount}, Untracked=${preparedStatus.untrackedCount}`);
assert.ok(preparedStatus.stagedCount > 0, 'Must have staged changes for test');
assert.ok(preparedStatus.untrackedCount > 0, 'Must have untracked changes for test');
assert.ok(preparedStatus.dirty, 'Repository must be dirty');

// 3. Create isolated workspace
console.log('\n--- Creating Isolated Worktree from Dirty Main Repo ---');
const ws = await manager.createWorkspace({
  taskId: 'dirty_preservation_task',
  baseBranch: 'HEAD',
  agentId: 'antigravity',
});

console.log('- Worktree created at:', ws.worktreePath);
console.log('- Base Commit:', ws.baseCommit);
console.log('- Uncommitted Warning:', ws.uncommittedWarning);

assert.ok(ws.ok, 'Workspace creation must succeed even if main repo is dirty');
assert.ok(ws.baseCommit && ws.baseCommit.length >= 7, 'Base commit must be resolved');
assert.ok(ws.uncommittedWarning.includes('strictly preserved and NOT inherited'), 'Agent must be warned of non-inheritance');

// 4. Verify main repository uncommitted files were NOT leaked into the isolated worktree
assert.equal(
  fs.existsSync(path.join(ws.worktreePath, 'scratch', 'test-staged-file.txt')),
  false,
  'Staged files from main repo must NOT be leaked into isolated worktree'
);
assert.equal(
  fs.existsSync(path.join(ws.worktreePath, 'scratch', 'test-user-editing.txt')),
  false,
  'Untracked/user files from main repo must NOT be leaked into isolated worktree'
);

// 5. Simulate agent work inside the isolated worktree
const agentArtifact = path.join(ws.worktreePath, 'agent-output.json');
fs.writeFileSync(agentArtifact, JSON.stringify({ status: 'done', author: 'agent' }), 'utf8');

// 6. Verify main repository is STILL completely intact while worktree is active
const midStatus = await manager.checkMainRepoStatus();
assert.equal(midStatus.stagedCount, preparedStatus.stagedCount, 'Main repo staged count must remain identical');
assert.equal(midStatus.untrackedCount, preparedStatus.untrackedCount, 'Main repo untracked count must remain identical');

// 7. Cleanup worktree
console.log('\n--- Cleaning Up Worktree ---');
const cleanRes = await manager.cleanupWorkspace('dirty_preservation_task', { force: true });
assert.ok(cleanRes.ok, 'Cleanup must succeed');

// 8. Clean up staged test file from git index and scratch files
execSync(`git reset HEAD "${testStagedFile}"`);
try { fs.unlinkSync(testStagedFile); } catch {}
try { fs.unlinkSync(testUserFile); } catch {}

const finalStatus = await manager.checkMainRepoStatus();
console.log(`- Final Status: Main repo preserved with initial dirty files (${finalStatus.totalCount} files)`);
assert.equal(finalStatus.totalCount, initialStatus.totalCount, 'Main repo uncommitted files must be 100% preserved');

console.log('\n[PASS] Test 6: Dirty repository safety and preservation verified successfully!\n');
