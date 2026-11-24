/**
 * Test 4: Codex Execution Test
 * Real execution test with OpenAI Codex CLI (codex.cmd).
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';

console.log('=== TEST 4: CODEX CLI FIRST-CLASS PROVIDER EXECUTION ===');

const registry = createAdapterRegistry();
const codex = registry.getAdapter('codex-cli');

assert.ok(codex, 'Codex adapter must be registered');

const health = await codex.healthCheck();
console.log('- Health Check:', health);
assert.equal(health.healthy, true, 'Codex CLI binary must be healthy');

console.log('\n--- Executing Headless Codex Task ---');
const startTime = Date.now();
const result = await codex.execute({
  prompt: 'Reply with the word "CODEX_FIRST_CLASS_CONFIRMED" and nothing else',
  sandbox: 'read-only',
  timeoutMs: 45000,
});
const durationMs = Date.now() - startTime;

console.log('- Status:', result.status);
console.log('- Exit Code:', result.exitCode);
console.log('- Duration ms:', durationMs);
console.log('- Event Count:', result.structuredOutput?.eventCount);

assert.equal(result.status, 'COMPLETED', 'Codex task must complete with COMPLETED status');
assert.equal(result.exitCode, 0, 'Exit code must be 0');

console.log('\n[PASS] Test 4: Codex CLI first-class execution verified successfully!\n');
