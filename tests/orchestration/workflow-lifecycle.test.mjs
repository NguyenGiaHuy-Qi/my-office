/**
 * Test 1: Workflow Lifecycle Test
 * Tests DAG execution, task transitions, dependencies, event ordering, and SSE Last-Event-ID replay.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createWorkflows } from '../../server/workflows.mjs';

console.log('=== TEST 1: WORKFLOW LIFECYCLE & DAG ENGINE ===');

const testDir = path.resolve(process.cwd(), 'scratch', 'test-workflow-lifecycle');
fs.mkdirSync(testDir, { recursive: true });
const storeFile = path.join(testDir, 'workflows.json');

// Clean previous run if any
try { fs.unlinkSync(storeFile); } catch {}
try { fs.unlinkSync(`${storeFile}.scheduler.lock`); } catch {}

const dispatched = [];
const eventsEmitted = [];

const scheduler = createWorkflows({
  file: storeFile,
  maxConcurrent: 2,
  dispatch: async (w, task) => {
    dispatched.push({ id: task.id, provider: task.provider, attempt: task.attempt });
    return { ok: true, runId: `run_${task.id}`, pid: 99999 };
  },
  onEvent: (e) => {
    eventsEmitted.push(e);
  },
});

assert.ok(scheduler.schedulerAvailable, 'Scheduler lock must be acquired');

// 1. Create a DAG workflow: Task A -> Task B (depends on A), Task C (independent)
const createRes = scheduler.create({
  name: 'Test DAG Workflow',
  description: 'Testing Phase 2 scheduler consolidation',
  tasks: [
    { id: 'task-a', title: 'Task A (Antigravity Architecture)', provider: 'antigravity', priority: 5 },
    { id: 'task-b', title: 'Task B (Codex Implementation)', provider: 'codex-cli', dependsOn: ['task-a'], priority: 5 },
    { id: 'task-c', title: 'Task C (Claude Review)', provider: 'claude-code', priority: 1 },
  ],
});

assert.ok(createRes.ok, `Workflow creation failed: ${createRes.code}`);
const workflowId = createRes.workflow.id;
console.log(`- Created workflow ${workflowId} with 3 tasks`);

// Verify provider normalization
const taskA = createRes.workflow.tasks.find((t) => t.id === 'task-a');
const taskB = createRes.workflow.tasks.find((t) => t.id === 'task-b');
const taskC = createRes.workflow.tasks.find((t) => t.id === 'task-c');
assert.equal(taskA.provider, 'antigravity');
assert.equal(taskB.provider, 'codex-cli');
assert.equal(taskC.provider, 'claude-code');

// 2. Start workflow
const startRes = scheduler.start(workflowId);
assert.ok(startRes.ok, 'Workflow start failed');

// Wait for scheduler loop turn
await new Promise((r) => setTimeout(r, 50));

let live = scheduler.get(workflowId);
assert.equal(live.status, 'running');

// Task A and Task C should be dispatched/running (Task B blocked on Task A)
const statusA = live.tasks.find((t) => t.id === 'task-a').status;
const statusB = live.tasks.find((t) => t.id === 'task-b').status;
const statusC = live.tasks.find((t) => t.id === 'task-c').status;

console.log(`- Initial states: Task A=${statusA}, Task B=${statusB}, Task C=${statusC}`);
assert.ok(['dispatching', 'running'].includes(statusA), 'Task A must be running/dispatching');
assert.ok(['dispatching', 'running'].includes(statusC), 'Task C must be running/dispatching');
assert.ok(['pending', 'blocked'].includes(statusB), 'Task B must wait for Task A');

// 3. Complete Task A
scheduler.settle(workflowId, 'task-a', {
  status: 'completed',
  result: 'Architecture spec created successfully',
});

// Wait for scheduler loop turn
await new Promise((r) => setTimeout(r, 50));

live = scheduler.get(workflowId);
const updatedStatusA = live.tasks.find((t) => t.id === 'task-a').status;
const updatedStatusB = live.tasks.find((t) => t.id === 'task-b').status;
console.log(`- After Task A completed: Task A=${updatedStatusA}, Task B=${updatedStatusB}`);
assert.equal(updatedStatusA, 'completed');
assert.ok(['ready', 'queued', 'dispatching', 'running'].includes(updatedStatusB), 'Task B should now be unblocked');

// 4. Complete remaining tasks
scheduler.settle(workflowId, 'task-c', { status: 'completed', result: 'Review complete' });
scheduler.settle(workflowId, 'task-b', { status: 'completed', result: 'Feature implemented' });

await new Promise((r) => setTimeout(r, 50));
live = scheduler.get(workflowId);
console.log(`- Final workflow status: ${live.status}`);
assert.equal(live.status, 'completed', 'Workflow should be completed');

// 5. Test Event Sequencing and Last-Event-ID replay
const allEvents = scheduler.events(workflowId);
assert.ok(allEvents.length >= 5, 'Should have multiple events recorded');
assert.ok(allEvents[0].seq != null, 'Events must have monotonic sequence numbers');

const midSeq = allEvents[2].seq;
const replayedEvents = scheduler.getEventsSince(workflowId, midSeq);
console.log(`- Total events: ${allEvents.length}, Events after seq ${midSeq}: ${replayedEvents.length}`);
assert.equal(replayedEvents.length, allEvents.length - 3, 'Last-Event-ID replay must filter correctly');

scheduler.dispose();
console.log('[PASS] Test 1: Workflow Lifecycle & DAG engine verified successfully!\n');
