import {
  LLM_PROVIDER_INFO,
  type LlmProvider,
  type Pipeline,
  type ValidationReport,
} from '@pipeline-builder/core';

import type { RunState } from '@/entities/run';

/**
 * Why a pipeline cannot run, as the Run button explains it ("Fix 2 errors to run"), or null when
 * it can: validation errors block a run (see docs/adr/0008), and an empty pipeline has nothing to
 * run. Warnings do not block.
 */
export function runBlocker(
  nodeCount: number,
  report: Pick<ValidationReport, 'errorCount'>,
): string | null {
  if (report.errorCount > 0) {
    return `Fix ${String(report.errorCount)} ${report.errorCount === 1 ? 'error' : 'errors'} to run`;
  }
  return nodeCount === 0 ? 'Add a node to run' : null;
}

/**
 * The provider of the first LLM Call in `pipeline` that runs with the user's API key and has none
 * yet, or null when every key it needs is there. Every LLM Call counts, even one on a branch the
 * run may not take.
 */
export function findMissingApiKey(
  pipeline: Pipeline,
  getApiKey: (provider: LlmProvider) => string | null,
): LlmProvider | null {
  for (const node of pipeline.nodes) {
    if (node.kind !== 'llm-call') continue;
    const { provider } = node.data;
    if (LLM_PROVIDER_INFO[provider].needsApiKey && getApiKey(provider) === null) return provider;
  }
  return null;
}

/** Why Next step and Continue are unavailable; null for one that is available. */
export interface StepBlockers {
  readonly next: string | null;
  readonly continue: string | null;
}

/**
 * Why the controls of step mode are unavailable for the run in `state`, as their tooltips say it.
 * Next step needs a run paused before a node; Continue, a run going step by step, paused or not.
 */
export function stepBlockers({
  status,
  stepping,
  pausedNodeId,
}: Pick<RunState, 'status' | 'stepping' | 'pausedNodeId'>): StepBlockers {
  if (status !== 'running') {
    const reason = 'Run the pipeline to step through it';
    return { next: reason, continue: reason };
  }
  if (!stepping) {
    const reason = 'The run goes on without pausing';
    return { next: reason, continue: reason };
  }
  return { next: pausedNodeId === null ? 'A node is running' : null, continue: null };
}
