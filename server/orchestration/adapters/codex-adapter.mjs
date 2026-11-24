/**
 * OpenAI Codex CLI Adapter for Universal Agent Orchestration.
 * Implements normalized execution, stream parsing, and sandbox controls for Codex CLI.
 */

import { BaseAgentAdapter } from './base-agent-adapter.mjs';
import { verifyBinaryVersion } from '../discovery/binary-resolver.mjs';

export class CodexAdapter extends BaseAgentAdapter {
  constructor({ binaryPath, defaultTimeoutMs = 180_000 } = {}) {
    super({
      providerId: 'codex-cli',
      name: 'OpenAI Codex CLI',
      binaryPath: binaryPath || 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\codex.cmd',
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
      supportedOutputFormats: ['text', 'json', 'file'],
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

    // codex exec [PROMPT] --json
    const args = ['exec', task.prompt];

    if (task.stream || task.json !== false) {
      args.push('--json');
    }

    // Sandbox controls: default to workspace-write
    const sandbox = task.sandbox || 'workspace-write';
    if (sandbox === 'danger-full-access') {
      if (task.approvalVerified === true) {
        args.push('--sandbox', 'danger-full-access');
      } else {
        // Safe fallback
        args.push('--sandbox', 'workspace-write');
      }
    } else {
      args.push('--sandbox', sandbox);
    }

    if (task.outputFile) {
      args.push('-o', task.outputFile);
    }

    if (task.useNativeWorktree) {
      args.push('--worktree');
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
        type: parsed.type || 'event',
        data: parsed,
        text: parsed.content || (parsed.delta && parsed.delta.text) || parsed.message || '',
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

