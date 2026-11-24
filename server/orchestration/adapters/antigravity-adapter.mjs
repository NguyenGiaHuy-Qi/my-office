/**
 * Google Antigravity CLI Adapter for Universal Agent Orchestration.
 * Implements normalized execution, stream parsing, and workspace binding for Antigravity CLI (agy).
 */

import { BaseAgentAdapter } from './base-agent-adapter.mjs';
import { verifyBinaryVersion } from '../discovery/binary-resolver.mjs';

export class AntigravityAdapter extends BaseAgentAdapter {
  constructor({ binaryPath, defaultTimeoutMs = 180_000 } = {}) {
    super({
      providerId: 'antigravity',
      name: 'Google Antigravity',
      binaryPath: binaryPath || 'C:\\Users\\LENOVO\\.gemini\\bin\\agy.exe',
      defaultTimeoutMs,
    });
  }

  getCapabilities() {
    return {
      provider: this.providerId,
      name: this.name,
      headless: true,
      streaming: true,
      worktreeNative: false, // Managed via My Office Worktree Manager
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

    // agy -p [PROMPT] --output-format json/stream-json
    const args = ['-p', task.prompt, '--output-format', task.stream ? 'stream-json' : 'json'];

    // Safe permission control
    if (task.dangerouslySkipPermissions === true && task.approvalVerified === true) {
      args.push('--dangerously-skip-permissions');
    }

    if (task.mode) {
      args.push('--mode', task.mode); // 'auto' | 'accept-edits' | 'plan'
    }

    if (task.addDir) {
      args.push('--add-dir', task.addDir);
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
      return {
        provider: this.providerId,
        type: parsed.type || 'message',
        data: parsed,
        text: parsed.text || parsed.content || (parsed.delta && parsed.delta.text) || '',
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

