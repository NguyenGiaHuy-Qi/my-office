/**
 * Base Agent Adapter for Universal Agent Orchestration.
 * Defines the normalized contract, execution lifecycle, safe process management,
 * process tree termination on Windows, and structured event handling.
 */

import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

export const EXECUTION_STATUS = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMEOUT: 'TIMEOUT',
};

// Sensitive patterns for log/output redaction
const SENSITIVE_PATTERNS = [
  /(?:sk-[a-zA-Z0-9_-]{20,})/g,
  /(?:ghp_[a-zA-Z0-9]{30,})/g,
  /(?:Bearer\s+[a-zA-Z0-9_.-]{20,})/gi,
  /(?:AIza[0-9A-Za-z-_]{35})/g, // Google API key
  /(?:ANTHROPIC_API_KEY=[^\s&]+)/gi,
  /(?:OPENAI_API_KEY=[^\s&]+)/gi,
  /(?:GEMINI_API_KEY=[^\s&]+)/gi,
  /(?:password=[^\s&]+)/gi,
];

export function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let clean = text;
  for (const pat of SENSITIVE_PATTERNS) {
    clean = clean.replace(pat, '[REDACTED_SECRET]');
  }
  return clean;
}

/**
 * Safely kills a process and all its children on Windows/Unix.
 */
export function killProcessTree(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return;
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      execSync(`taskkill /F /T /PID ${pid} >nul 2>&1`, { windowsHide: true, timeout: 5000 });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* process may already be dead */
    }
  }
}

/**
 * Base Agent Adapter class.
 */
export class BaseAgentAdapter {
  constructor({ providerId, name, binaryPath, defaultTimeoutMs = 120_000 } = {}) {
    this.providerId = providerId;
    this.name = name;
    this.binaryPath = binaryPath;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.activeRuns = new Map(); // runId -> RunRecord
  }

  getCapabilities() {
    throw new Error('getCapabilities() must be implemented by subclass');
  }

  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }

  buildExecutionArgs(task, runId) {
    throw new Error('buildExecutionArgs() must be implemented by subclass');
  }

  parseEvent(line) {
    // Default JSON event parser
    if (!line || !line.trim()) return null;
    try {
      return JSON.parse(line.trim());
    } catch {
      return { type: 'raw_line', text: line };
    }
  }

  extractFilesChanged(events, stdout) {
    const files = new Set();
    const gitDiffRegex = /(?:diff --git a\/(.+?) b\/|modified:\s+(.+?)$|\+\+\+ b\/(.+?)$)/gm;
    let match;
    while ((match = gitDiffRegex.exec(stdout)) !== null) {
      const file = match[1] || match[2] || match[3];
      if (file) files.add(file.trim());
    }
    return Array.from(files);
  }

  /**
   * Normalized execute method (non-streaming).
   */
  async execute(task) {
    return new Promise((resolve) => {
      this.stream(task, {
        onComplete: (result) => resolve(result),
        onError: (result) => resolve(result),
      });
    });
  }

  /**
   * Normalized streaming execution method.
   */
  stream(task, { onEvent = () => {}, onComplete = () => {}, onError = () => {} } = {}) {
    const runId = task.runId || `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const prompt = task.prompt || task.instruction || task.description || '';
    const cwd = task.cwd || task.workspaceDir || process.cwd();
    const timeoutMs = task.timeoutMs || this.defaultTimeoutMs;

    if (!this.binaryPath || !fs.existsSync(this.binaryPath)) {
      const failResult = {
        runId,
        provider: this.providerId,
        status: EXECUTION_STATUS.FAILED,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        exitCode: -1,
        stdout: '',
        stderr: `Binary not found at path: ${this.binaryPath}`,
        structuredOutput: null,
        filesChanged: [],
        usage: null,
        error: `Binary not found at path: ${this.binaryPath}`,
      };
      onError(failResult);
      return runId;
    }

    const { command, args, env } = this.buildExecutionArgs({ ...task, prompt, cwd }, runId);
    const startedAt = new Date().toISOString();

    const runRecord = {
      runId,
      provider: this.providerId,
      status: EXECUTION_STATUS.RUNNING,
      startedAt,
      completedAt: null,
      exitCode: null,
      stdout: '',
      stderr: '',
      structuredOutput: null,
      filesChanged: [],
      usage: null,
      error: null,
      pid: null,
      childProcess: null,
      events: [],
    };

    this.activeRuns.set(runId, runRecord);

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let timeoutTimer = null;

    try {
      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env, CI: '1' },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Close stdin immediately so interactive CLIs (like codex exec) don't hang waiting for piped stdin
      if (task.stdinInput) {
        child.stdin.write(task.stdinInput);
      }
      child.stdin.end();

      runRecord.pid = child.pid;
      runRecord.childProcess = child;

      // Timeout watchdog
      timeoutTimer = setTimeout(() => {
        runRecord.status = EXECUTION_STATUS.TIMEOUT;
        runRecord.error = `Execution timed out after ${timeoutMs}ms`;
        killProcessTree(child.pid);
      }, timeoutMs);

      // Process stdout line by line
      let lineBuffer = '';
      child.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stdoutBuffer += text;

        lineBuffer += text;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop(); // keep partial line

        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = this.parseEvent(line);
          if (evt) {
            runRecord.events.push(evt);
            onEvent({ runId, type: 'event', event: evt });
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        stderrBuffer += text;
        onEvent({ runId, type: 'stderr', chunk: redactSecrets(text) });
      });

      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        runRecord.status = EXECUTION_STATUS.FAILED;
        runRecord.completedAt = new Date().toISOString();
        runRecord.error = err.message;
        runRecord.stderr = redactSecrets(stderrBuffer);
        this.activeRuns.delete(runId);
        onError(runRecord);
      });

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        // Process remaining buffer
        if (lineBuffer && lineBuffer.trim()) {
          const evt = this.parseEvent(lineBuffer);
          if (evt) runRecord.events.push(evt);
        }

        const isTimeout = runRecord.status === EXECUTION_STATUS.TIMEOUT;
        const isCancelled = runRecord.status === EXECUTION_STATUS.CANCELLED;

        runRecord.completedAt = new Date().toISOString();
        runRecord.exitCode = code;
        runRecord.stdout = redactSecrets(stdoutBuffer);
        runRecord.stderr = redactSecrets(stderrBuffer);
        runRecord.filesChanged = this.extractFilesChanged(runRecord.events, runRecord.stdout);

        if (!isTimeout && !isCancelled) {
          runRecord.status = code === 0 ? EXECUTION_STATUS.COMPLETED : EXECUTION_STATUS.FAILED;
        }

        if (runRecord.status === EXECUTION_STATUS.FAILED && !runRecord.error) {
          runRecord.error = `Process exited with code ${code}: ${runRecord.stderr || runRecord.stdout.slice(-500)}`;
        }

        // Finalize structured output
        runRecord.structuredOutput = this.synthesizeStructuredOutput(runRecord);

        this.activeRuns.delete(runId);

        if (runRecord.status === EXECUTION_STATUS.COMPLETED) {
          onComplete(runRecord);
        } else {
          onError(runRecord);
        }
      });
    } catch (spawnError) {
      clearTimeout(timeoutTimer);
      runRecord.status = EXECUTION_STATUS.FAILED;
      runRecord.completedAt = new Date().toISOString();
      runRecord.error = spawnError.message;
      this.activeRuns.delete(runId);
      onError(runRecord);
    }

    return runId;
  }

  cancel(runId) {
    const run = this.activeRuns.get(runId);
    if (!run || !run.pid) return false;
    run.status = EXECUTION_STATUS.CANCELLED;
    run.error = 'Execution cancelled by user or orchestrator';
    killProcessTree(run.pid);
    this.activeRuns.delete(runId);
    return true;
  }

  getStatus(runId) {
    const run = this.activeRuns.get(runId);
    if (run) return { ...run, childProcess: undefined };
    return null;
  }

  synthesizeStructuredOutput(runRecord) {
    // If output is pure JSON, parse it
    try {
      const trimmed = runRecord.stdout.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        return JSON.parse(trimmed);
      }
    } catch {
      /* not pure JSON */
    }

    // Otherwise, return collected events and summary
    return {
      eventCount: runRecord.events.length,
      lastEvent: runRecord.events[runRecord.events.length - 1] || null,
      rawOutputLength: runRecord.stdout.length,
    };
  }
}
