import {
  LLM_PROVIDER_INFO,
  type LlmProvider,
  type Pipeline,
  type ValidationReport,
} from '@pipeline-builder/core';

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
