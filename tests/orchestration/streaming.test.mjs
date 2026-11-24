/**
 * Test C: Streaming Event Test.
 * Tests streaming events from adapters via stream(), verifying onEvent callback receives
 * structured events in real-time, and onComplete returns normalized result.
 */

import assert from 'node:assert/strict';
import { createAdapterRegistry } from '../../server/orchestration/adapters/index.mjs';

console.log('=== TEST C: STREAMING EVENT TEST ===');

const registry = createAdapterRegistry();
const codex = registry.getAdapter('codex-cli');
assert.ok(codex, 'Codex adapter must be available');

const eventsCollected = [];
let completedResult = null;

console.log('\nStarting streaming execution with Codex...');
await new Promise((resolve, reject) => {
  codex.stream(
    {
      prompt: 'List 3 short bullet points about unit testing',
      stream: true,
      sandbox: 'read-only',
      timeoutMs: 30000,
    },
    {
      onEvent: (evt) => {
        eventsCollected.push(evt);
        if (evt.event?.type) {
          console.log(`[Stream Event] type: ${evt.event.type}`);
        }
      },
      onComplete: (res) => {
        completedResult = res;
        resolve(res);
      },
      onError: (err) => {
        reject(err);
      },
    }
  );
});

console.log(`\nCollected ${eventsCollected.length} streaming event(s).`);
console.log('- Status:', completedResult.status);
console.log('- Exit Code:', completedResult.exitCode);
console.log('- Output preview:\n', completedResult.stdout.slice(0, 300));

assert.ok(eventsCollected.length > 0, 'Must have received streaming events');
assert.equal(completedResult.status, 'COMPLETED', 'Stream must complete successfully');
assert.equal(completedResult.exitCode, 0, 'Exit code must be 0');

console.log('\n[PASS] Test C: Streaming event processing verified successfully!');

