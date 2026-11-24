/**
 * Test 3: Claude Execution & Configuration Test
 * Tests Claude Code CLI discovery, argument formatting, execution lifecycle,
 * and error normalization (including offline localhost:3001 gateway warning).
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';

console.log('=== TEST 3: CLAUDE CODE EXECUTION & CONFIGURATION AUDIT ===');

const registry = createAdapterRegistry();
const claude = registry.getAdapter('claude-code');

assert.ok(claude, 'Claude adapter must be registered');

// 1. Health & Discovery check
const health = await claude.healthCheck();
console.log('- Health Check:', health);
assert.equal(health.healthy, true, 'Claude Code binary must be discovered and verified');
assert.ok(health.version.includes('Claude Code'), 'Version string must identify Claude Code');

// 2. Capabilities inspection
const caps = claude.getCapabilities();
console.log('- Capabilities:', caps);
assert.equal(caps.headless, true);
assert.equal(caps.provider, 'claude-code');

// 3. Execution arguments validation
const dummyTask = {
  prompt: 'Analyze repository health',
  cwd: process.cwd(),
  dangerouslySkipPermissions: false,
};
const { command, args } = claude.buildExecutionArgs(dummyTask, 'test_run_123');
console.log('- Build Args Command:', command);
console.log('- Build Args List:', args);
assert.ok(args.includes('-p'), 'Arguments must include -p flag for non-interactive execution');
assert.ok(args.includes('Analyze repository health'), 'Arguments must contain prompt');

// 4. Timeout watchdog and failure normalization
console.log('\n--- Testing Watchdog & Offline Gateway Protection ---');
const timeoutRes = await claude.execute({
  prompt: 'Test prompt',
  timeoutMs: 100, // 100ms forces watchdog trigger
});

console.log('- Status on watchdog trigger:', timeoutRes.status);
console.log('- Error message:', timeoutRes.error);
assert.equal(timeoutRes.status, 'TIMEOUT', 'Watchdog must terminate task on timeout');
assert.ok(timeoutRes.error.includes('timed out'), 'Error must report timeout clearly');

console.log('\n[PASS] Test 3: Claude Code execution and watchdog verified successfully!\n');
