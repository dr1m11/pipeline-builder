import {
  findNode,
  LLM_PROVIDER_INFO,
  type LlmProvider,
  type NodeRunStatus,
  type Pipeline,
} from '@pipeline-builder/core';

import type { ToastOptions } from '@/shared/ui/toast';

import type { NodeFailure, RunEnd } from '../model/run-session';

/** How nodes end, in the order the run summary counts them, and the word for each. */
const ENDINGS = [
  ['done', 'done'],
  ['error', 'failed'],
  ['skipped', 'skipped'],
  ['cancelled', 'cancelled'],
] as const satisfies readonly (readonly [NodeRunStatus, string])[];

/**
 * How the nodes of a run ended, counted: "4 nodes done, 1 skipped". Endings no node had are left
 * out; the first count names the nodes.
 */
export function describeNodeEndings(nodes: ReadonlyMap<string, NodeRunStatus>): string {
  const statuses = [...nodes.values()];
  const counts = ENDINGS.map(
    ([status, word]) => [statuses.filter((each) => each === status).length, word] as const,
  ).filter(([count]) => count > 0);
  if (counts.length === 0) return 'no nodes ran';
  return counts
    .map(([count, word], index) =>
      index === 0
        ? `${String(count)} ${count === 1 ? 'node' : 'nodes'} ${word}`
        : `${String(count)} ${word}`,
    )
    .join(', ');
}

/**
 * What the run's live region says when it ends: "Run finished: 4 nodes done, 1 skipped", "Run
 * stopped", or "Run failed at Model: …" with the node that failed first.
 */
export function describeRunEnd(end: RunEnd, pipeline: Pipeline): string {
  switch (end.type) {
    case 'finished':
      return describeFinishedRun(end, pipeline);
    case 'invalid':
      return 'Run failed: the pipeline has errors';
    case 'broken':
      return 'Run failed unexpectedly';
  }
}

function describeFinishedRun(
  { summary, firstFailure }: Extract<RunEnd, { type: 'finished' }>,
  pipeline: Pipeline,
): string {
  switch (summary.status) {
    case 'done':
      return `Run finished: ${describeNodeEndings(summary.nodes)}`;
    case 'cancelled':
      return 'Run stopped';
    case 'error':
      return firstFailure === null
        ? 'Run failed'
        : `Run failed at ${nodeLabel(pipeline, firstFailure.nodeId)}: ${firstFailure.error.message}`;
  }
}

/**
 * The toast for a run that failed, or null for one that did not. It names the node that failed
 * first and why; when a provider rejected the API key, it offers to add another one with
 * `onAddApiKey`.
 */
export function runFailureToast(
  end: RunEnd,
  pipeline: Pipeline,
  onAddApiKey: (provider: LlmProvider) => void,
): ToastOptions | null {
  if (end.type === 'broken') {
    return {
      tone: 'danger',
      title: 'Run failed',
      description: 'Something went wrong while running the pipeline.',
    };
  }
  if (end.type !== 'finished' || end.summary.status !== 'error' || end.firstFailure === null) {
    return null;
  }
  const failure = end.firstFailure;
  const provider = keyProvider(pipeline, failure);
  return {
    tone: 'danger',
    title: 'Run failed',
    description: `${nodeLabel(pipeline, failure.nodeId)}: ${failure.error.message}`,
    action:
      provider === null
        ? undefined
        : {
            label: 'Add API key',
            altText: `Open API keys in the header to add your ${LLM_PROVIDER_INFO[provider].title} key`,
            onClick: () => {
              onAddApiKey(provider);
            },
          },
  };
}

/** The provider whose API key `failure` blames, or null when it is not about a key. */
function keyProvider(pipeline: Pipeline, failure: NodeFailure): LlmProvider | null {
  if (failure.error.code !== 'invalid-key') return null;
  const node = findNode(pipeline, failure.nodeId);
  if (node?.kind !== 'llm-call') return null;
  const { provider } = node.data;
  return LLM_PROVIDER_INFO[provider].needsApiKey ? provider : null;
}

function nodeLabel(pipeline: Pipeline, nodeId: string): string {
  return findNode(pipeline, nodeId)?.label ?? 'A node';
}
