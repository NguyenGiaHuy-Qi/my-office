/**
 * Claude Code Adapter for Universal Agent Orchestration.
 * Implements normalized execution, stream parsing, and safe parameterization for Claude Code CLI.
 */

import { BaseAgentAdapter } from './base-agent-adapter.mjs';
import { verifyBinaryVersion } from '../discovery/binary-resolver.mjs';

export class ClaudeCodeAdapter extends BaseAgentAdapter {
  constructor({ binaryPath, defaultTimeoutMs = 180_000 } = {}) {
    super({
      providerId: 'claude-code',
      name: 'Claude Code',
      binaryPath: binaryPath || 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\claude.cmd',
      defaultTimeoutMs,
    });
  }

  getCapabilities() {
    return {
      provider: this.providerId,
      name: this.name,
      headless: true,
      streaming: true,
      worktreeNative: true,
      supportedOutputFormats: ['text', 'json', 'stream-json'],
      supportedRoles: ['code', 'review', 'plan', 'test', 'refactor', 'audit'],
      maxConcurrency: 2,
    };
  }

  async healthCheck() {
    const check = verifyBinaryVersion(this.binaryPath, 5000);
    return {
      healthy: check.verified,
      version: check.version,
      binaryPath: this.binaryPath,
      error: check.error,
    };
  }

  buildExecutionArgs(task, runId) {
    const isWin = process.platform === 'win32';
    const isCmd = isWin && /\.(cmd|bat)$/i.test(this.binaryPath);

    const args = ['-p', task.prompt, '--output-format', task.stream ? 'stream-json' : 'json'];

    // Safe permission control
    if (task.allowTools && Array.isArray(task.allowTools)) {
      args.push('--tools', task.allowTools.join(','));
    }
    if (task.dangerouslySkipPermissions === true && task.approvalVerified === true) {
      args.push('--dangerously-skip-permissions');
    }

    if (task.useNativeWorktree && task.worktreeName) {
      args.push('--worktree', task.worktreeName);
    }

    if (isCmd) {
      return {
        command: 'cmd.exe',
        args: ['/c', this.binaryPath, ...args],
        env: { ...task.env },
      };
    }

    return {
      command: this.binaryPath,
      args,
      env: { ...task.env },
    };
  }

  parseEvent(line) {
    if (!line || !line.trim()) return null;
    try {
      const parsed = JSON.parse(line.trim());
      // Standardize event shape
      const text = parsed.text || parsed.content || (parsed.delta && parsed.delta.text) || parsed.result || '';
      return {
        provider: this.providerId,
        type: parsed.type || 'message',
        data: parsed,
        text,
        isError: !!parsed.is_error,
        rateLimited: parsed.api_error === 'usage_limit_reached' || parsed.api_error_status === 429,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        provider: this.providerId,
        type: 'raw',
        text: line,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

