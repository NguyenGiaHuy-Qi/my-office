/**
 * Test E: Multi-Agent Handoff Pipeline Test.
 * Simulates a full handoff pipeline across equal agents:
 * - Agent A (Antigravity) generates an architecture artifact.
 * - Agent B (Codex) receives handoff context and implements the feature.
 * - Agent C (QA Reviewer) inspects the handoff record, files changed, and validates evidence.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHandoffEngine } from '../../server/orchestration/engine/handoff-engine.mjs';
import { UniversalWorktreeManager } from '../../server/orchestration/workspace/worktree-manager.mjs';

console.log('=== TEST E: MULTI-AGENT HANDOFF PIPELINE TEST ===');

const handoffEngine = createHandoffEngine();
const worktreeManager = new UniversalWorktreeManager({ repoRoot: process.cwd() });
const handoffsMap = new Map();

const taskId = `handoff_pipeline_${Date.now()}`;
let workspace = null;

try {
  // 1. Setup isolated workspace for the handoff pipeline
  console.log('\nStep 1: Creating isolated workspace for pipeline...');
  workspace = await worktreeManager.createWorkspace({ taskId });
  console.log(`- Workspace created at: ${workspace.worktreePath}`);

  // 2. Agent A (Antigravity): Architecture & Plan
  console.log('\nStep 2: Agent A (Antigravity) produces Architecture & Design Spec...');
  const specPath = path.join(workspace.worktreePath, 'UNIVERSAL-SPEC.md');
  fs.writeFileSync(
    specPath,
    '# Universal Spec\n\nDefines a normalized string sanitizer function `sanitizeInput(str)`.\n',
    'utf8'
  );

  const handoffA = handoffEngine.createHandoffRecord({
    subtaskId: 'step_1_architecture',
    masterTaskId: taskId,
    provider: 'antigravity',
    agentId: 'antigravity',
    summary: 'Created specification for string sanitizer function',
    filesChanged: ['UNIVERSAL-SPEC.md'],
    contracts: [{ name: 'sanitizeInput', args: ['string'], returns: 'string' }],
    decisions: ['Use standard regex replacement', 'Fail closed on non-string input'],
    testResults: { passed: 0, failed: 0 },
    rawOutput: 'Architecture design completed successfully.',
  });
  handoffsMap.set('step_1_architecture', handoffA);
  console.log('- Handoff A recorded with summary and contracts');

  // 3. Agent B (Codex): Receives Handoff A and implements code
  console.log('\nStep 3: Agent B (Codex) receives Handoff A and implements feature...');
  const downstreamB = handoffEngine.assembleDownstreamContext(
    {
      id: 'step_2_implementation',
      dependencies: ['step_1_architecture'],
      instruction: 'Implement sanitizeInput function based on upstream spec',
    },
    handoffsMap
  );

  console.log('- Upstream Context length delivered to Agent B:', downstreamB.upstreamContext.length);
  assert.ok(downstreamB.upstreamContext.includes('UNIVERSAL-SPEC.md'), 'Agent B must see upstream files');
  assert.ok(downstreamB.upstreamContext.includes('sanitizeInput'), 'Agent B must see upstream contract');

  // Implement the file
  const codePath = path.join(workspace.worktreePath, 'sanitizer.mjs');
  fs.writeFileSync(
    codePath,
    'export function sanitizeInput(str) { return typeof str === "string" ? str.trim().replace(/<[^>]*>/g, "") : ""; }\n',
    'utf8'
  );

  const handoffB = handoffEngine.createHandoffRecord({
    subtaskId: 'step_2_implementation',
    masterTaskId: taskId,
    provider: 'codex-cli',
    agentId: 'codex-cli',
    summary: 'Implemented sanitizeInput with HTML tag stripping in sanitizer.mjs',
    filesChanged: ['sanitizer.mjs'],
    contracts: [{ name: 'sanitizeInput', implemented: true }],
    decisions: ['Implemented regex HTML tag stripper'],
    testResults: { passed: 5, failed: 0 },
    rawOutput: 'Implementation passed unit tests.',
  });
  handoffsMap.set('step_2_implementation', handoffB);
  console.log('- Handoff B recorded with implementation details');

  // 4. Agent C: Receives Handoff B and performs QA Review
  console.log('\nStep 4: Agent C (Reviewer) reviews combined handoffs and files...');
  const downstreamC = handoffEngine.assembleDownstreamContext(
    {
      id: 'step_3_review',
      dependencies: ['step_1_architecture', 'step_2_implementation'],
      instruction: 'Review code compliance against spec and verify tests pass',
    },
    handoffsMap
  );

  assert.ok(downstreamC.upstreamContext.includes('step_1_architecture'));
  assert.ok(downstreamC.upstreamContext.includes('step_2_implementation'));

  // Verify physical files exist in worktree and content matches
  const status = await worktreeManager.getGitStatus(workspace.worktreePath);
  console.log(`- Files verified in worktree: ${status.fileCount}`);
  assert.equal(status.dirty, true);
  assert.ok(status.files.some((f) => f.file.includes('sanitizer.mjs')), 'Status must include sanitizer.mjs');

  const content = fs.readFileSync(codePath, 'utf8');
  assert.ok(content.includes('sanitizeInput'), 'File content must match contract implementation');
  console.log('- Artifact content verified: implementation matches handoff contracts');

  // 5. Cleanup
  console.log('\nStep 5: Cleaning up pipeline workspace...');
  await worktreeManager.cleanupWorkspace(taskId, { force: true, deleteBranch: true });
  console.log('- Workspace cleaned up cleanly');

  console.log('\n[PASS] Test E: Multi-agent handoff pipeline verified successfully!');
} catch (err) {
  if (workspace) {
    try {
      await worktreeManager.cleanupWorkspace(taskId, { force: true, deleteBranch: true });
    } catch {
      /* ignore */
    }
  }
  throw err;
}
