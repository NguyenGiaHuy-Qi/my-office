/**
 * Agent Adapters Index & Factory.
 */

import { ClaudeCodeAdapter } from './claude-code-adapter.mjs';
import { CodexAdapter } from './codex-adapter.mjs';
import { AntigravityAdapter } from './antigravity-adapter.mjs';
import { resolveAllProviders, PROVIDER_IDS } from '../discovery/binary-resolver.mjs';

export {
  ClaudeCodeAdapter,
  CodexAdapter,
  AntigravityAdapter,
};

export function createAdapterRegistry(options = {}) {
  const resolved = resolveAllProviders(options);
  const adapters = new Map();

  const claudeInfo = resolved.providers[PROVIDER_IDS.CLAUDE_CODE];
  if (claudeInfo && claudeInfo.binaryPath) {
    adapters.set(PROVIDER_IDS.CLAUDE_CODE, new ClaudeCodeAdapter({ binaryPath: claudeInfo.binaryPath }));
  }

  const codexInfo = resolved.providers[PROVIDER_IDS.CODEX_CLI];
  if (codexInfo && codexInfo.binaryPath) {
    adapters.set(PROVIDER_IDS.CODEX_CLI, new CodexAdapter({ binaryPath: codexInfo.binaryPath }));
  }

  const agyInfo = resolved.providers[PROVIDER_IDS.ANTIGRAVITY];
  if (agyInfo && agyInfo.binaryPath) {
    adapters.set(PROVIDER_IDS.ANTIGRAVITY, new AntigravityAdapter({ binaryPath: agyInfo.binaryPath }));
  }

  return {
    getAdapter(providerId) {
      return adapters.get(providerId) || null;
    },
    getAllAdapters() {
      return Array.from(adapters.values());
    },
    getResolvedProviders() {
      return resolved;
    },
  };
}

