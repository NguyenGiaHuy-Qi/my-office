/**
 * Universal Git Worktree Manager for My Office Orchestration.
 * Provides isolated workspaces for subtasks, branch isolation, concurrency locking,
 * conflict detection, git diff capture, and safe cleanup.
 */

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function execGit(args, cwd, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout,
        maxBuffer: 16 << 20,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          code: err ? err.code || 1 : 0,
          stdout: stdout ? stdout.toString('utf8') : '',
          stderr: stderr ? stderr.toString('utf8') : '',
          error: err ? err.message : null,
        });
      }
    );
  });
}

export class UniversalWorktreeManager {
  constructor({ baseWorktreeDir = null, repoRoot = null } = {}) {
    this.repoRoot = repoRoot ? path.resolve(repoRoot) : process.cwd();
    this.baseWorktreeDir = baseWorktreeDir
      ? path.resolve(baseWorktreeDir)
      : path.join(this.repoRoot, '.orchestration-worktrees');
    this.activeLocks = new Map(); // worktreePath -> LockInfo
  }

  ensureBaseDir() {
    if (!fs.existsSync(this.baseWorktreeDir)) {
      fs.mkdirSync(this.baseWorktreeDir, { recursive: true });
    }
  }

  /**
   * Inspects the main repository status to guarantee uncommitted changes are preserved.
   */
  async checkMainRepoStatus() {
    const res = await execGit(['status', '--porcelain=v1'], this.repoRoot);
    if (!res.ok) {
      return { ok: false, error: res.stderr || res.error, dirty: false, files: [] };
    }
    // trimEnd only: porcelain lines start with a meaningful space (" M file")
    const lines = res.stdout.trimEnd().split(/\r?\n/).filter(Boolean);
    const files = lines.map((l) => ({
      indexStatus: l.slice(0, 1),
      worktreeStatus: l.slice(1, 2),
      status: l.slice(0, 2).trim(),
      file: l.slice(3).trim(),
    }));
    const staged = files.filter((f) => f.indexStatus !== ' ' && f.indexStatus !== '?');
    const unstaged = files.filter((f) => f.worktreeStatus !== ' ' && f.indexStatus !== '?');
    const untracked = files.filter((f) => f.status === '??');

    return {
      ok: true,
      dirty: files.length > 0,
      totalCount: files.length,
      stagedCount: staged.length,
      unstagedCount: unstaged.length,
      untrackedCount: untracked.length,
      files,
    };
  }

  /**
   * Creates an isolated worktree for a task.
   */
  async createWorkspace({ taskId, branchName = null, baseBranch = 'HEAD', agentId = null } = {}) {
    if (!taskId) throw new Error('taskId is required to create an isolated workspace');
    this.ensureBaseDir();

    // Check main repository status to record uncommitted preservation
    const mainRepoStatus = await this.checkMainRepoStatus();

    // Resolve explicit base commit SHA
    const baseCommitRes = await execGit(['rev-parse', baseBranch], this.repoRoot);
    const baseCommit = baseCommitRes.ok ? baseCommitRes.stdout.trim() : 'HEAD';

    const sanitizedTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const worktreePath = path.join(this.baseWorktreeDir, `wt-${sanitizedTaskId}`);
    const branch = branchName || `orchestration/task-${sanitizedTaskId}`;

    // 1. Check if worktree directory already exists
    if (fs.existsSync(worktreePath)) {
      const lock = this.activeLocks.get(worktreePath);
      if (lock && lock.active) {
        throw new Error(`Workspace ${worktreePath} is already locked by task ${lock.taskId}`);
      }
      // Stale directory from previous aborted run: safely clean it up
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        await execGit(['worktree', 'prune'], this.repoRoot);
      } catch {
        /* ignore */
      }
    }

    // 2. Check if branch already exists
    const branchCheck = await execGit(['rev-parse', '--verify', branch], this.repoRoot);
    let worktreeResult;

    if (branchCheck.ok) {
      // Branch exists: check it out directly into worktree
      worktreeResult = await execGit(['worktree', 'add', worktreePath, branch], this.repoRoot);
    } else {
      // Branch does not exist: create with -b from explicit base commit
      worktreeResult = await execGit(['worktree', 'add', '-b', branch, worktreePath, baseCommit], this.repoRoot);
    }

    if (!worktreeResult.ok) {
      throw new Error(`Failed to create git worktree at ${worktreePath}: ${worktreeResult.stderr || worktreeResult.error}`);
    }

    // 3. Acquire initial workspace lock with full ownership metadata
    const lockInfo = this.lockWorkspace(worktreePath, { taskId, agentId, branch, baseCommit });

    const uncommittedWarning = mainRepoStatus.dirty
      ? `Main working directory has ${mainRepoStatus.totalCount} uncommitted changes (${mainRepoStatus.unstagedCount} modified, ${mainRepoStatus.stagedCount} staged, ${mainRepoStatus.untrackedCount} untracked). These changes are strictly preserved and NOT inherited in this workspace.`
      : null;

    return {
      ok: true,
      taskId,
      branch,
      baseCommit,
      worktreePath,
      repoRoot: this.repoRoot,
      mainRepoDirty: mainRepoStatus.dirty,
      uncommittedWarning,
      lockInfo,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Locks workspace to prevent concurrent modification by another agent.
   */
  lockWorkspace(worktreePath, { taskId, agentId = null, branch = null, baseCommit = null } = {}) {
    const lockInfo = {
      worktreePath,
      taskId,
      agentId,
      branch,
      baseCommit,
      pid: process.pid,
      lockedAt: new Date().toISOString(),
      active: true,
    };
    this.activeLocks.set(worktreePath, lockInfo);

    // Write lock file to disk
    try {
      const lockFile = path.join(worktreePath, '.workspace-lock.json');
      fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2), 'utf8');
    } catch {
      /* ignore file write error */
    }

    return lockInfo;
  }

  /**
   * Unlocks a workspace.
   */
  unlockWorkspace(worktreePath) {
    const lock = this.activeLocks.get(worktreePath);
    if (lock) {
      lock.active = false;
      this.activeLocks.delete(worktreePath);
    }

    try {
      const lockFile = path.join(worktreePath, '.workspace-lock.json');
      if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    } catch {
      /* ignore */
    }

    return true;
  }

  /**
   * Gets git status of the worktree.
   */
  async getGitStatus(worktreePath) {
    if (!fs.existsSync(worktreePath)) {
      return { ok: false, error: 'Worktree path does not exist', dirty: false, files: [] };
    }

    const res = await execGit(['status', '--porcelain=v1'], worktreePath);
    if (!res.ok) {
      return { ok: false, error: res.stderr || res.error, dirty: false, files: [] };
    }

    const lines = res.stdout.trimEnd().split(/\r?\n/).filter(Boolean);
    const files = lines.map((l) => ({
      status: l.slice(0, 2).trim(),
      file: l.slice(3).trim(),
    }));

    return {
      ok: true,
      dirty: files.length > 0,
      fileCount: files.length,
      files,
      raw: res.stdout,
    };
  }

  /**
   * Gets diff of modified files in the worktree.
   */
  async getDiff(worktreePath) {
    if (!fs.existsSync(worktreePath)) {
      return { ok: false, error: 'Worktree path does not exist', diff: '' };
    }

    const unstaged = await execGit(['diff'], worktreePath);
    const staged = await execGit(['diff', '--cached'], worktreePath);

    return {
      ok: unstaged.ok && staged.ok,
      unstagedDiff: unstaged.stdout,
      stagedDiff: staged.stdout,
      fullDiff: `${staged.stdout}\n${unstaged.stdout}`.trim(),
    };
  }

  /**
   * Detects merge conflicts against target branch.
   */
  async detectConflicts(worktreePath, targetBranch = 'HEAD') {
    if (!fs.existsSync(worktreePath)) {
      return { hasConflicts: false, error: 'Worktree path does not exist' };
    }

    // Use merge-tree to preview merge without modifying working copy
    const currentBranchRes = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
    const currentBranch = currentBranchRes.stdout.trim() || 'HEAD';

    // --write-tree (Git 2.38+): exit 0 = clean merge, exit 1 = conflicts, other = error
    const checkRes = await execGit(['merge-tree', '--write-tree', targetBranch, currentBranch], worktreePath);
    if (checkRes.code === 0 || checkRes.code === 1) {
      const hasConflict = checkRes.code === 1;
      return {
        hasConflicts: hasConflict,
        targetBranch,
        currentBranch,
        details: hasConflict ? checkRes.stdout.slice(0, 2000) : null,
      };
    }

    return { hasConflicts: false, error: checkRes.stderr };
  }

  /**
   * Safely cleans up a worktree.
   */
  async cleanupWorkspace(taskId, { force = false, deleteBranch = true } = {}) {
    const sanitizedTaskId = String(taskId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const worktreePath = path.join(this.baseWorktreeDir, `wt-${sanitizedTaskId}`);

    if (!fs.existsSync(worktreePath)) {
      return { ok: true, message: 'Worktree already cleaned or does not exist' };
    }

    // 1. Verify ownership and active lock
    let lock = this.activeLocks.get(worktreePath);
    if (!lock) {
      try {
        const lockFile = path.join(worktreePath, '.workspace-lock.json');
        if (fs.existsSync(lockFile)) lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      } catch { /* ignore */ }
    }
    if (lock && lock.taskId && lock.taskId !== taskId && !force) {
      throw new Error(`Cannot cleanup workspace: ownership mismatch (locked by task ${lock.taskId}, cleanup requested for ${taskId})`);
    }
    if (lock && lock.active && !force) {
      throw new Error(`Cannot cleanup workspace: active task ${lock.taskId} is currently executing`);
    }

    // 2. Check for unsaved/uncommitted changes
    const status = await this.getGitStatus(worktreePath);
    if (status.dirty && !force) {
      throw new Error(`Cannot cleanup workspace: contains ${status.fileCount} uncommitted change(s). Pass force: true to discard.`);
    }

    // 3. Remove worktree via git
    const branchRes = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath);
    const branch = branchRes.stdout.trim();

    const removeArgs = ['worktree', 'remove'];
    if (force) removeArgs.push('--force');
    removeArgs.push(worktreePath);

    const removeRes = await execGit(removeArgs, this.repoRoot);
    if (!removeRes.ok) {
      // Fallback manual directory cleanup if git worktree remove fails
      try {
        fs.rmSync(worktreePath, { recursive: true, force: true });
        await execGit(['worktree', 'prune'], this.repoRoot);
      } catch (rmErr) {
        throw new Error(`Failed to remove worktree: ${removeRes.stderr} (Fallback error: ${rmErr.message})`);
      }
    }

    // 4. Optionally delete temporary branch
    if (deleteBranch && branch && branch.startsWith('orchestration/')) {
      await execGit(['branch', force ? '-D' : '-d', branch], this.repoRoot);
    }

    this.unlockWorkspace(worktreePath);

    return {
      ok: true,
      cleanedPath: worktreePath,
      deletedBranch: deleteBranch ? branch : null,
    };
  }

  /**
   * Lists all active git worktrees.
   */
  async listActiveWorktrees() {
    const res = await execGit(['worktree', 'list', '--porcelain'], this.repoRoot);
    if (!res.ok) return [];

    const worktrees = [];
    let current = {};
    for (const line of res.stdout.split(/\r?\n/)) {
      if (!line.trim()) {
        if (current.worktree) worktrees.push(current);
        current = {};
        continue;
      }
      const [key, ...vals] = line.split(' ');
      current[key] = vals.join(' ');
    }
    if (current.worktree) worktrees.push(current);

    return worktrees;
  }
}

