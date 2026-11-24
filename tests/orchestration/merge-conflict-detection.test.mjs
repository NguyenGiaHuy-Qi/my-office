/**
 * Test 14: detectConflicts (merge-tree --write-tree) and porcelain filename parsing.
 * Runs in a throwaway repo under the OS temp dir.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-conflict-'));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, windowsHide: true }).toString();

try {
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'user.name', 'test');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'line one\n');
  fs.writeFileSync(path.join(repo, 'alpha.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'base');

  const manager = new UniversalWorktreeManager({ repoRoot: repo, baseWorktreeDir: path.join(repo, '.wts') });

  // Porcelain " M alpha.txt": the leading space must survive so the filename is not truncated.
  fs.writeFileSync(path.join(repo, 'alpha.txt'), 'changed\n');
  const status = await manager.checkMainRepoStatus();
  assert.ok(status.files.some((f) => f.file === 'alpha.txt'), `expected alpha.txt, got ${JSON.stringify(status.files)}`);
  git(repo, 'checkout', '--', 'alpha.txt');

  const ws = await manager.createWorkspace({ taskId: 'conflict_case' });

  // Clean case: worktree branch has no divergent change yet.
  const clean = await manager.detectConflicts(ws.worktreePath, 'main');
  assert.equal(clean.hasConflicts, false, `clean merge reported conflict: ${JSON.stringify(clean)}`);
  assert.equal(clean.error, undefined);

  // Conflict case: both sides edit the same line.
  fs.writeFileSync(path.join(ws.worktreePath, 'shared.txt'), 'worktree edit\n');
  git(ws.worktreePath, 'commit', '-q', '-am', 'worktree side');
  fs.writeFileSync(path.join(repo, 'shared.txt'), 'main edit\n');
  git(repo, 'commit', '-q', '-am', 'main side');

  const conflict = await manager.detectConflicts(ws.worktreePath, 'main');
  assert.equal(conflict.hasConflicts, true, `conflict not detected: ${JSON.stringify(conflict)}`);
  assert.match(conflict.details, /shared\.txt/);

  await manager.cleanupWorkspace('conflict_case', { force: true });
  console.log('[PASS] Test 14: Merge conflict detection and porcelain parsing verified successfully!');
} finally {
  try { git(repo, 'worktree', 'prune'); } catch { /* ignore */ }
  fs.rmSync(repo, { recursive: true, force: true });
}
