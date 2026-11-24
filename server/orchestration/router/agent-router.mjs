/**
 * Universal Agent Equality Router for My Office Orchestration.
 * Routes tasks to Claude Code, Codex, or Antigravity based on real dynamic criteria
 * without hardcoding fixed roles by agent name.
 */

import { PROVIDER_IDS, resolveAllProviders, PROVIDER_STATUS } from '../discovery/binary-resolver.mjs';

export const TASK_TYPES = {
  ARCHITECTURE_PLAN: 'architecture_plan',
  FEATURE_IMPLEMENTATION: 'feature_implementation',
  BUG_FIX: 'bug_fix',
  UNIT_TESTING: 'unit_testing',
  CODE_REVIEW: 'code_review',
  SYSTEM_AUDIT: 'system_audit',
  DOCUMENTATION: 'documentation',
};

export class UniversalAgentRouter {
  constructor({ qualityHistory = null, quotaTracker = null } = {}) {
    this.qualityHistory = qualityHistory || new Map(); // provider -> averageScore
    this.quotaTracker = quotaTracker || new Map();     // provider -> remainingQuota
  }

  /**
   * Evaluates and scores an agent for a specific task.
   */
  scoreAgentForTask(providerId, providerInfo, task) {
    if (!providerInfo || providerInfo.status !== PROVIDER_STATUS.READY) {
      return {
        provider: providerId,
        eligible: false,
        score: -1,
        reasons: [`Provider is not ready: status is ${providerInfo?.status || 'UNKNOWN'}`],
      };
    }

    let score = 50; // Neutral baseline for equal opportunity
    const reasons = ['Base eligibility score: 50'];

    const taskType = task.type || TASK_TYPES.FEATURE_IMPLEMENTATION;
    const language = (task.language || '').toLowerCase();
    const repoContext = task.repoContext || {};

    // 1. Language & Ecosystem match
    if (language === 'typescript' || language === 'javascript' || language === 'node') {
      score += 15;
      reasons.push('High affinity for JavaScript/TypeScript ecosystem (+15)');
    } else if (language === 'python') {
      score += 15;
      reasons.push('High affinity for Python ecosystem (+15)');
    } else if (language === 'rust' || language === 'c++') {
      score += 10;
      reasons.push('Affinity for systems programming (+10)');
    }

    // 2. Task Type fit (Equal capability with context-aware scoring)
    switch (taskType) {
      case TASK_TYPES.CODE_REVIEW:
        score += 10;
        reasons.push('Supported code review capability (+10)');
        break;
      case TASK_TYPES.FEATURE_IMPLEMENTATION:
      case TASK_TYPES.BUG_FIX:
        score += 10;
        reasons.push('Supported implementation & debugging capability (+10)');
        break;
      case TASK_TYPES.ARCHITECTURE_PLAN:
        score += 10;
        reasons.push('Supported multi-step planning capability (+10)');
        break;
      case TASK_TYPES.UNIT_TESTING:
        score += 10;
        reasons.push('Supported test execution & assertion capability (+10)');
        break;
      default:
        break;
    }

    // 3. Native Worktree preference if requested
    if (task.requireNativeWorktree && providerInfo.capabilities?.supportsWorktree) {
      score += 15;
      reasons.push('Native worktree flag supported (+15)');
    }

    // 4. Quality History bonus (dynamic learning)
    const historyScore = this.qualityHistory.get(providerId);
    if (typeof historyScore === 'number') {
      const delta = (historyScore - 70) / 2; // e.g. 90 -> +10, 50 -> -10
      score += delta;
      reasons.push(`Historical QA performance adjustment (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`);
    }

    // 5. Quota / Capacity health
    const quota = this.quotaTracker.get(providerId);
    if (quota && quota.exhausted) {
      score -= 40;
      reasons.push('Provider quota near exhaustion (-40)');
    }

    return {
      provider: providerId,
      eligible: true,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons,
    };
  }

  /**
   * Routes a task by returning all candidates ranked by score.
   */
  routeTask(task, { providerRegistry = null } = {}) {
    const resolved = providerRegistry || resolveAllProviders();
    const evaluations = [];

    for (const [id, info] of Object.entries(resolved.providers)) {
      evaluations.push(this.scoreAgentForTask(id, info, task));
    }

    // Sort descending by score
    evaluations.sort((a, b) => b.score - a.score);

    const eligible = evaluations.filter((e) => e.eligible);
    const selected = eligible.length > 0 ? eligible[0] : null;

    return {
      taskId: task.id || `task_${Date.now()}`,
      taskType: task.type || TASK_TYPES.FEATURE_IMPLEMENTATION,
      selectedProvider: selected ? selected.provider : null,
      topScore: selected ? selected.score : 0,
      candidates: evaluations,
      selectionRationale: selected
        ? `Selected ${selected.provider} with score ${selected.score}. Details: ${selected.reasons.join('; ')}`
        : 'No eligible providers ready for execution',
    };
  }
}

