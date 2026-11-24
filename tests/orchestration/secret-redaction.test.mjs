/**
 * Test 10: Secret Redaction Test
 * Tests that secrets (OpenAI, Anthropic, Gemini, GitHub, Bearer tokens) are strictly
 * redacted across adapters, handoffs, and workflow outputs.
 */

import assert from 'node:assert/strict';
import { redactSecrets } from '../../server/orchestration/adapters/base-agent-adapter.mjs';
import { redact } from '../../server/redact.mjs';
import { createHandoffEngine } from '../../server/orchestration/engine/handoff-engine.mjs';

console.log('=== TEST 10: SECRET REDACTION & SENSITIVE DATA DEFENSE ===');

const mockSecrets = [
  'sk-ant-api03-abcdef1234567890abcdef1234567890abcdef12-anthropic',
  'sk-proj-abcdef12345678901234567890abcdef-openai',
  'AIzaSyB1234567890abcdefghijklmnopqrstuv',
  'ghp_1234567890abcdefghijklmnopqrstuvwxyz1234',
  'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  'OPENAI_API_KEY=sk-test-1234567890abcdef12345',
  'ANTHROPIC_API_KEY=sk-ant-test-1234567890abcdef12345',
  'GEMINI_API_KEY=AIzaSyTestKey1234567890abcdefghijk',
];

// 1. Adapter Layer Secret Redaction
console.log('--- 1. Testing Adapter Log Redaction ---');
for (const secret of mockSecrets) {
  const logSnippet = `Execution log containing credential: ${secret} for api call.`;
  const sanitized = redactSecrets(logSnippet);
  assert.equal(sanitized.includes(secret), false, `Adapter failed to redact secret: ${secret}`);
  assert.ok(sanitized.includes('[REDACTED_SECRET]'), 'Adapter must insert [REDACTED_SECRET]');
}
console.log('- Successfully verified adapter redaction across 8 credential formats');

// 2. Server Redact Module
console.log('\n--- 2. Testing Server Redact Module ---');
for (const secret of mockSecrets) {
  const sanitized = redact(`Error output: ${secret}`);
  assert.equal(sanitized.includes(secret), false, `Server redact failed for: ${secret}`);
}
console.log('- Successfully verified server redact module');

// 3. Handoff Engine End-to-End Redaction
console.log('\n--- 3. Testing Handoff Engine End-to-End Redaction ---');
const engine = createHandoffEngine();
const handoff = engine.createHandoffRecord({
  subtaskId: 'leak_test',
  masterTaskId: 'master_leak',
  provider: 'antigravity',
  summary: `Agent completed task with key: ${mockSecrets[0]}`,
  decisions: [`Configured authorization: ${mockSecrets[4]}`],
  outstandingIssues: [`Check token: ${mockSecrets[2]}`],
  rawOutput: `Dumping environment: ${mockSecrets[5]} and ${mockSecrets[6]}`,
});

assert.equal(handoff.summary.includes(mockSecrets[0]), false, 'Summary must NOT contain secret');
assert.equal(handoff.decisions[0].includes(mockSecrets[4]), false, 'Decisions must NOT contain secret');
assert.equal(handoff.outstandingIssues[0].includes(mockSecrets[2]), false, 'Issues must NOT contain secret');
assert.equal(handoff.outputExcerpt.includes(mockSecrets[5]), false, 'Raw output excerpt must NOT contain secret');

console.log('- Sanitized Handoff Summary:', handoff.summary);
console.log('- Sanitized Decisions:', handoff.decisions[0]);

console.log('\n[PASS] Test 10: Secret redaction verified successfully!\n');
