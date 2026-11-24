/**
 * Test B: Headless Smoke Test.
 * Tests sending simple headless tasks to adapters, validating exit code, structured JSON output,
 * and testing timeout watchdog protection.
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';

console.log('=== TEST B: HEADLESS SMOKE TEST ===');

const registry = createAdapterRegistry();
const agy = registry.getAdapter('antigravity');
const codex = registry.getAdapter('codex-cli');
const claude = registry.getAdapter('claude-code');

assert.ok(agy, 'Antigravity adapter must be registered');
assert.ok(codex, 'Codex adapter must be registered');
assert.ok(claude, 'Claude adapter must be registered');

// 1. Antigravity Headless Smoke Test
console.log('\n--- 1. Testing Antigravity Headless Execution ---');
const agyResult = await agy.execute({
  prompt: 'Reply with the word "SMOKE_TEST_OK" and nothing else',
  timeoutMs: 30000,
});

console.log('- Status:', agyResult.status);
console.log('- Exit Code:', agyResult.exitCode);
console.log('- Duration ms:', agyResult.duration_ms || 'measured');
console.log('- Structured Output:', JSON.stringify(agyResult.structuredOutput, null, 2));

assert.equal(agyResult.status, 'COMPLETED', 'Antigravity task must complete successfully');
assert.equal(agyResult.exitCode, 0, 'Antigravity exit code must be 0');
assert.ok(agyResult.structuredOutput, 'Antigravity structured output must be present');

// 2. Codex Headless Smoke Test
console.log('\n--- 2. Testing Codex Headless Execution ---');
const codexResult = await codex.execute({
  prompt: 'Reply with the word "SMOKE_TEST_OK" and nothing else',
  sandbox: 'read-only',
  timeoutMs: 30000,
});

console.log('- Status:', codexResult.status);
console.log('- Exit Code:', codexResult.exitCode);
console.log('- Event Count:', codexResult.structuredOutput?.eventCount);

assert.equal(codexResult.status, 'COMPLETED', 'Codex task must complete successfully');
assert.equal(codexResult.exitCode, 0, 'Codex exit code must be 0');

// 3. Timeout Watchdog Protection Test
console.log('\n--- 3. Testing Timeout Watchdog Protection ---');
const timeoutResult = await agy.execute({
  prompt: 'Analyze a complex question with deep thinking',
  timeoutMs: 50, // 50ms must trigger timeout
});

console.log('- Status:', timeoutResult.status);
console.log('- Error:', timeoutResult.error);
assert.equal(timeoutResult.status, 'TIMEOUT', 'Watchdog must trigger TIMEOUT');
assert.ok(timeoutResult.error.includes('timed out'), 'Error message must reflect timeout');

console.log('\n[PASS] Test B: Headless smoke tests and timeout watchdog verified successfully!');

