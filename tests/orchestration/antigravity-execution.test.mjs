/**
 * Test 2: Antigravity Execution Test
 * Real headless execution test with Google Antigravity CLI (agy.exe).
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';

console.log('=== TEST 2: ANTIGRAVITY FIRST-CLASS PROVIDER EXECUTION ===');

const registry = createAdapterRegistry();
const agy = registry.getAdapter('antigravity');

assert.ok(agy, 'Antigravity adapter must be registered');

const health = await agy.healthCheck();
console.log('- Health Check:', health);
assert.equal(health.healthy, true, 'Antigravity CLI must be verified and healthy');

console.log('\n--- Executing Headless Antigravity Task ---');
const startTime = Date.now();
const result = await agy.execute({
  prompt: 'Reply with the word "AGY_FIRST_CLASS_CONFIRMED" and nothing else',
  timeoutMs: 45000,
});
const durationMs = Date.now() - startTime;

console.log('- Status:', result.status);
console.log('- Exit Code:', result.exitCode);
console.log('- Duration ms:', durationMs);
console.log('- Structured Output:', JSON.stringify(result.structuredOutput, null, 2));

assert.equal(result.status, 'COMPLETED', 'Antigravity task must complete with COMPLETED status');
assert.equal(result.exitCode, 0, 'Exit code must be 0');
assert.ok(result.structuredOutput, 'Structured output must be parsed');
assert.ok(
  result.stdout.includes('AGY_FIRST_CLASS_CONFIRMED') ||
  result.structuredOutput?.response?.includes('AGY_FIRST_CLASS_CONFIRMED'),
  'Antigravity response must contain confirmed phrase'
);

// Verify usage telemetry
if (result.structuredOutput?.usage) {
  console.log('- Telemetry verified: inputTokens =', result.structuredOutput.usage.input_tokens, 'outputTokens =', result.structuredOutput.usage.output_tokens);
  assert.ok(result.structuredOutput.usage.input_tokens > 0, 'Telemetry input tokens must be greater than 0');
}

console.log('\n[PASS] Test 2: Antigravity first-class execution verified successfully!\n');
