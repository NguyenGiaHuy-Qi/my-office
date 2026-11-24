/**
 * Test A: Universal Binary Discovery Test.
 * Verifies that all 3 agents (Claude Code, Codex CLI, Antigravity) are properly discovered,
 * versions are verified, authentication is validated, and status is marked READY.
 */

import assert from 'node:assert/strict';
import { resolveAllProviders, PROVIDER_IDS, PROVIDER_STATUS } from '../../server/orchestration/discovery/binary-resolver.mjs';

console.log('=== TEST A: DISCOVERY TEST ===');

const resolution = resolveAllProviders();
console.log('Resolved timestamp:', resolution.resolvedAt);

for (const [id, provider] of Object.entries(resolution.providers)) {
  console.log(`\nChecking provider: ${id}`);
  console.log(`- Status: ${provider.status}`);
  console.log(`- Binary Path: ${provider.binaryPath}`);
  console.log(`- Version: ${provider.version}`);
  console.log(`- Authenticated: ${provider.authenticated} (${provider.authMethod})`);

  assert.ok(provider.binaryPath, `Binary path must exist for ${id}`);
  assert.ok(provider.version, `Version must be verified for ${id}`);
  assert.equal(provider.authenticated, true, `Provider ${id} must be authenticated`);
  assert.equal(provider.status, PROVIDER_STATUS.READY, `Provider ${id} must be READY`);
}

assert.equal(resolution.allReady, true, 'All 3 providers must be READY');
console.log('\n[PASS] Test A: All 3 agents discovered and verified READY!');

