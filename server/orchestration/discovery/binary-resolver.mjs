/**
 * Universal Binary Discovery Resolver for My Office Universal Orchestration.
 * Locates, verifies versions, checks authentication, and validates headless execution
 * across Claude Code CLI, OpenAI Codex CLI, and Google Antigravity CLI.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

export const PROVIDER_STATUS = {
  NOT_INSTALLED: 'NOT_INSTALLED',
  DISCOVERED: 'DISCOVERED',
  VERSION_VERIFIED: 'VERSION_VERIFIED',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  READY: 'READY',
  ERROR: 'ERROR',
};

export const PROVIDER_IDS = {
  CLAUDE_CODE: 'claude-code',
  CODEX_CLI: 'codex-cli',
  ANTIGRAVITY: 'antigravity',
};

/**
 * Common Windows search directories by provider.
 */
function getKnownSearchPaths(home) {
  const isWin = process.platform === 'win32';
  if (!isWin) return [];

  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';

  return {
    npmGlobal: path.join(appData, 'npm'),
    geminiBin: path.join(home, '.gemini', 'bin'),
    localPrograms: path.join(localAppData, 'Programs'),
    windowsApps: path.join(localAppData, 'Microsoft', 'WindowsApps'),
    systemWindowsApps: path.join(programFiles, 'WindowsApps'),
  };
}

/**
 * Searches for all candidate binaries on the host system.
 */
export function findBinaryCandidates(name, options = {}) {
  const isWin = process.platform === 'win32';
  const exts = isWin ? ['.cmd', '.exe', '.bat', ''] : [''];
  const candidates = new Set();
  const home = os.homedir();
  const known = getKnownSearchPaths(home);

  // 1. Check specific known directories per binary
  if (name === 'agy' || name === 'antigravity') {
    if (known.geminiBin) {
      for (const ext of exts) {
        const p = path.join(known.geminiBin, 'agy' + ext);
        if (fs.existsSync(p)) candidates.add(p);
      }
    }
  }

  if (name === 'claude' || name === 'claude-code') {
    if (known.npmGlobal) {
      for (const ext of exts) {
        const p = path.join(known.npmGlobal, 'claude' + ext);
        if (fs.existsSync(p)) candidates.add(p);
      }
    }
  }

  if (name === 'codex' || name === 'codex-cli') {
    if (known.npmGlobal) {
      for (const ext of exts) {
        const p = path.join(known.npmGlobal, 'codex' + ext);
        if (fs.existsSync(p)) candidates.add(p);
      }
    }
  }

  // 2. Search via system 'where' (Windows) or 'which' (Unix)
  try {
    const whichCmd = isWin ? 'where.exe' : 'which';
    const out = execFileSync(whichCmd, [name], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    });
    for (const line of out.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      if (fs.existsSync(line)) candidates.add(line);
    }
  } catch {
    /* ignore where failure */
  }

  // 3. Search PATH environment variable
  const pathDirs = (process.env.PATH || '').split(path.delimiter);
  for (const dir of pathDirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (fs.existsSync(full)) candidates.add(full);
    }
  }

  return Array.from(candidates);
}

/**
 * Safely executes a binary to verify its version string.
 */
export function verifyBinaryVersion(binaryPath, timeoutMs = 4000) {
  if (!binaryPath || !fs.existsSync(binaryPath)) {
    return { verified: false, version: null, error: 'Binary path does not exist' };
  }

  const isWin = process.platform === 'win32';
  const isCmdOrBat = isWin && /\.(cmd|bat)$/i.test(binaryPath);

  try {
    let res;
    if (isCmdOrBat) {
      res = spawnSync('cmd.exe', ['/c', binaryPath, '--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
      });
    } else {
      res = spawnSync(binaryPath, ['--version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        windowsHide: true,
      });
    }

    if (res.error) {
      return { verified: false, version: null, error: res.error.message };
    }

    const stdout = (res.stdout || '').trim();
    const stderr = (res.stderr || '').trim();
    const output = stdout || stderr;
    const versionLine = output.split(/\r?\n/)[0] || '';

    if (res.status === 0 && versionLine) {
      return { verified: true, version: versionLine, rawOutput: output, error: null };
    }

    return {
      verified: false,
      version: versionLine || null,
      rawOutput: output,
      error: `Exit code ${res.status}: ${stderr || stdout}`,
    };
  } catch (err) {
    return { verified: false, version: null, error: err.message };
  }
}

/**
 * Checks authentication status on host for a specific provider.
 */
export function checkAuthStatus(providerId) {
  const home = os.homedir();

  switch (providerId) {
    case PROVIDER_IDS.CLAUDE_CODE: {
      const claudeJson = path.join(home, '.claude.json');
      const claudeDir = path.join(home, '.claude');
      const hasConfig = fs.existsSync(claudeJson) || fs.existsSync(claudeDir);
      return {
        authenticated: hasConfig,
        method: hasConfig ? 'session_config' : 'none',
        configPath: fs.existsSync(claudeJson) ? claudeJson : claudeDir,
      };
    }

    case PROVIDER_IDS.CODEX_CLI: {
      const codexDir = path.join(home, '.codex');
      const authFile = path.join(codexDir, 'auth.json');
      const configFile = path.join(codexDir, 'config.toml');
      const authenticated = fs.existsSync(authFile) || fs.existsSync(configFile);
      return {
        authenticated,
        method: fs.existsSync(authFile) ? 'oauth_credentials' : fs.existsSync(configFile) ? 'config_toml' : 'none',
        configPath: fs.existsSync(authFile) ? authFile : codexDir,
      };
    }

    case PROVIDER_IDS.ANTIGRAVITY: {
      const geminiDir = path.join(home, '.gemini');
      const agyDir = path.join(geminiDir, 'antigravity');
      const authenticated = fs.existsSync(geminiDir);
      return {
        authenticated,
        method: authenticated ? 'gemini_host_session' : 'none',
        configPath: fs.existsSync(agyDir) ? agyDir : geminiDir,
      };
    }

    default:
      return { authenticated: false, method: 'unknown', configPath: null };
  }
}

/**
 * Probes headless non-interactive capabilities.
 */
export function probeHeadlessCapabilities(providerId, binaryPath) {
  const isWin = process.platform === 'win32';
  const isCmdOrBat = isWin && /\.(cmd|bat)$/i.test(binaryPath);

  switch (providerId) {
    case PROVIDER_IDS.CLAUDE_CODE:
      return {
        headlessSupported: true,
        cliMode: 'print_flag',
        promptArg: '-p',
        outputFormats: ['text', 'json', 'stream-json'],
        supportsWorktree: true,
        worktreeFlag: '--worktree',
        isolationMode: 'process_and_worktree',
      };

    case PROVIDER_IDS.CODEX_CLI:
      return {
        headlessSupported: true,
        cliMode: 'exec_subcommand',
        promptArg: 'exec',
        outputFormats: ['text', 'json', 'file'],
        supportsWorktree: true,
        worktreeFlag: '--worktree',
        isolationMode: 'sandbox_and_worktree',
      };

    case PROVIDER_IDS.ANTIGRAVITY:
      return {
        headlessSupported: true,
        cliMode: 'print_flag',
        promptArg: '-p',
        outputFormats: ['text', 'json', 'stream-json'],
        supportsWorktree: false, // Managed via My Office Worktree Manager
        worktreeFlag: null,
        isolationMode: 'orchestrator_worktree',
      };

    default:
      return {
        headlessSupported: false,
        cliMode: 'unknown',
        promptArg: null,
        outputFormats: [],
        supportsWorktree: false,
        isolationMode: 'unsupported',
      };
  }
}

/**
 * Resolves a single provider's complete discovery profile.
 */
export function resolveProvider(providerId, options = {}) {
  const binaryNames = {
    [PROVIDER_IDS.CLAUDE_CODE]: ['claude'],
    [PROVIDER_IDS.CODEX_CLI]: ['codex'],
    [PROVIDER_IDS.ANTIGRAVITY]: ['agy', 'antigravity'],
  }[providerId] || [];

  let chosenBinary = null;
  let allCandidates = [];

  for (const name of binaryNames) {
    const candidates = findBinaryCandidates(name, options);
    allCandidates.push(...candidates);
    if (!chosenBinary && candidates.length) {
      // Prioritize .cmd / .exe on Windows
      const isWin = process.platform === 'win32';
      if (isWin) {
        chosenBinary = candidates.find((c) => /\.(cmd|exe)$/i.test(c)) || candidates[0];
      } else {
        chosenBinary = candidates[0];
      }
    }
  }

  const nowIso = new Date().toISOString();

  if (!chosenBinary) {
    return {
      provider: providerId,
      status: PROVIDER_STATUS.NOT_INSTALLED,
      binaryPath: null,
      candidates: allCandidates,
      version: null,
      authenticated: false,
      capabilities: null,
      checkedAt: nowIso,
      error: 'Binary not found in PATH or standard installation directories',
    };
  }

  // Verify version
  const verResult = verifyBinaryVersion(chosenBinary, options.timeoutMs || 4000);
  if (!verResult.verified) {
    return {
      provider: providerId,
      status: PROVIDER_STATUS.DISCOVERED,
      binaryPath: chosenBinary,
      candidates: allCandidates,
      version: verResult.version,
      authenticated: false,
      capabilities: null,
      checkedAt: nowIso,
      error: verResult.error || 'Failed to verify version',
    };
  }

  // Check auth
  const authResult = checkAuthStatus(providerId);
  const capabilities = probeHeadlessCapabilities(providerId, chosenBinary);

  let status = PROVIDER_STATUS.VERSION_VERIFIED;
  if (!authResult.authenticated) {
    status = PROVIDER_STATUS.AUTH_REQUIRED;
  } else if (capabilities.headlessSupported) {
    status = PROVIDER_STATUS.READY;
  }

  return {
    provider: providerId,
    status,
    binaryPath: chosenBinary,
    candidates: allCandidates,
    version: verResult.version,
    authenticated: authResult.authenticated,
    authMethod: authResult.method,
    configPath: authResult.configPath,
    capabilities,
    checkedAt: nowIso,
    error: null,
  };
}

/**
 * Universal Binary Discovery Resolver: Discovers and verifies all 3 providers.
 */
export function resolveAllProviders(options = {}) {
  const providers = [
    PROVIDER_IDS.CLAUDE_CODE,
    PROVIDER_IDS.CODEX_CLI,
    PROVIDER_IDS.ANTIGRAVITY,
  ];

  const results = {};
  for (const id of providers) {
    results[id] = resolveProvider(id, options);
  }

  return {
    resolvedAt: new Date().toISOString(),
    providers: results,
    allReady: Object.values(results).every((p) => p.status === PROVIDER_STATUS.READY),
  };
}

