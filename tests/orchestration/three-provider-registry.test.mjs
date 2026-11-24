/**
 * Test 5: Three-Provider Registry & Equality Test
 * Verifies that all 3 providers (Claude Code, Codex, Antigravity) are registered as first-class,
 * implement the identical BaseAgentAdapter contract, and are scored with equal eligibility.
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';
import { UniversalAgentRouter, TASK_TYPES } from '../../server/orchestration/router/agent-router.mjs';

console.log('=== TEST 5: THREE-PROVIDER REGISTRY & EQUALITY TEST ===');

const registry = createAdapterRegistry();
const resolved = registry.getResolvedProviders();

console.log('- Resolved Providers Count:', Object.keys(resolved.providers).length);

const expectedProviders = ['claude-code', 'codex-cli', 'antigravity'];
for (const p of expectedProviders) {
  const info = resolved.providers[p];
  assert.ok(info, `Provider ${p} must be resolved`);
  console.log(`  [${p}] status: ${info.status}, version: ${info.version}`);
  assert.equal(info.status, 'READY', `Provider ${p} must be READY`);

  const adapter = registry.getAdapter(p);
  assert.ok(adapter, `Adapter for ${p} must be instantiated`);

  // Verify unified BaseAgentAdapter interface
  assert.equal(typeof adapter.execute, 'function', `${p} must implement execute()`);
  assert.equal(typeof adapter.stream, 'function', `${p} must implement stream()`);
  assert.equal(typeof adapter.cancel, 'function', `${p} must implement cancel()`);
  assert.equal(typeof adapter.getCapabilities, 'function', `${p} must implement getCapabilities()`);
  assert.equal(typeof adapter.healthCheck, 'function', `${p} must implement healthCheck()`);

  const caps = adapter.getCapabilities();
  assert.ok(caps.supportedRoles.includes('code'), `${p} must support coding`);
  assert.ok(caps.supportedRoles.includes('review'), `${p} must support review`);
  assert.ok(caps.supportedRoles.includes('plan'), `${p} must support planning`);
  assert.ok(caps.supportedRoles.includes('test'), `${p} must support testing`);
}

// Equality Router Test: verify Antigravity is NOT hardcoded as reviewer only
console.log('\n--- Verifying Router Equality ---');
const router = new UniversalAgentRouter();
const codingTask = { type: TASK_TYPES.FEATURE_IMPLEMENTATION, language: 'javascript' };

for (const p of expectedProviders) {
  const score = router.scoreAgentForTask(p, resolved.providers[p], codingTask);
  console.log(`- ${p} coding score:`, score.score, score.reasons);
  assert.ok(score.eligible, `${p} must be eligible for feature implementation`);
  assert.ok(score.score >= 50, `${p} score must meet baseline requirement`);
}

console.log('\n[PASS] Test 5: Three-provider registry and equality verified successfully!\n');
