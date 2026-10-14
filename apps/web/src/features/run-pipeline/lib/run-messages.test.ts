import {
  type NodeRunStatus,
  type Pipeline,
  PIPELINE_TEMPLATES,
  type RunOutcome,
} from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import type { NodeFailure, RunEnd } from '../model/run-session';
import { describeNodeEndings, describeRunEnd, runFailureToast } from './run-messages';

/** "Ask a question": Question → Answer prompt → Model → Answer, with Model on `provider`. */
function askPipeline(provider: 'mock' | 'anthropic' = 'mock'): Pipeline {
  const template = PIPELINE_TEMPLATES.find(({ id }) => id === 'ask-a-question');
  if (template === undefined) throw new Error('The "Ask a question" template is missing');
  return {
    ...template.pipeline,
    nodes: template.pipeline.nodes.map((node) =>
      node.kind === 'llm-call' ? { ...node, data: { ...node.data, provider } } : node,
    ),
  };
}

function statuses(...list: readonly NodeRunStatus[]): ReadonlyMap<string, NodeRunStatus> {
  return new Map(list.map((status, index) => [`node-${String(index)}`, status]));
}

function finished(
  status: RunOutcome,
  nodes: ReadonlyMap<string, NodeRunStatus> = statuses(),
  firstFailure: NodeFailure | null = null,
): RunEnd {
  return { type: 'finished', summary: { status, nodes }, firstFailure };
}

const KEY_REJECTED: NodeFailure = {
  nodeId: 'model',
  error: { code: 'invalid-key', message: 'The API key was rejected.' },
};

describe('describeNodeEndings', () => {
  it('counts how the nodes ended, naming the nodes once', () => {
    expect(describeNodeEndings(statuses('done', 'done', 'skipped', 'done', 'done'))).toBe(
      '4 nodes done, 1 skipped',
    );
    expect(describeNodeEndings(statuses('done', 'error', 'skipped', 'cancelled'))).toBe(
      '1 node done, 1 failed, 1 skipped, 1 cancelled',
    );
  });

  it('starts with the first ending any node had', () => {
    expect(describeNodeEndings(statuses('skipped', 'skipped'))).toBe('2 nodes skipped');
  });

  it('says when no node ran', () => {
    expect(describeNodeEndings(statuses())).toBe('no nodes ran');
  });
});

describe('describeRunEnd', () => {
  const pipeline = askPipeline();

  it('counts the nodes of a finished run', () => {
    expect(describeRunEnd(finished('done', statuses('done', 'done', 'skipped')), pipeline)).toBe(
      'Run finished: 2 nodes done, 1 skipped',
    );
  });

  it('says that a stopped run stopped', () => {
    expect(describeRunEnd(finished('cancelled'), pipeline)).toBe('Run stopped');
  });

  it('names the node that failed first, and why', () => {
    expect(describeRunEnd(finished('error', statuses(), KEY_REJECTED), pipeline)).toBe(
      'Run failed at Model: The API key was rejected.',
    );
    expect(
      describeRunEnd(finished('error', statuses(), { ...KEY_REJECTED, nodeId: 'gone' }), pipeline),
    ).toBe('Run failed at A node: The API key was rejected.');
    expect(describeRunEnd(finished('error'), pipeline)).toBe('Run failed');
  });

  it('says that a refused or broken run failed', () => {
    expect(describeRunEnd({ type: 'invalid' }, pipeline)).toBe(
      'Run failed: the pipeline has errors',
    );
    expect(describeRunEnd({ type: 'broken' }, pipeline)).toBe('Run failed unexpectedly');
  });
});

describe('runFailureToast', () => {
  it('shows nothing for a run that did not fail', () => {
    const onAddApiKey = vi.fn();
    expect(runFailureToast(finished('done'), askPipeline(), onAddApiKey)).toBeNull();
    expect(runFailureToast(finished('cancelled'), askPipeline(), onAddApiKey)).toBeNull();
    expect(runFailureToast({ type: 'invalid' }, askPipeline(), onAddApiKey)).toBeNull();
  });

  it('names the node that failed first, and why', () => {
    const failure: NodeFailure = {
      nodeId: 'model',
      error: { code: 'timeout', message: 'The model took too long to answer.' },
    };

    expect(
      runFailureToast(finished('error', statuses(), failure), askPipeline('anthropic'), vi.fn()),
    ).toEqual({
      tone: 'danger',
      title: 'Run failed',
      description: 'Model: The model took too long to answer.',
      action: undefined,
    });
  });

  it('offers to add an API key when the provider rejected one', () => {
    const onAddApiKey = vi.fn();

    const toast = runFailureToast(
      finished('error', statuses(), KEY_REJECTED),
      askPipeline('anthropic'),
      onAddApiKey,
    );
    toast?.action?.onClick();

    expect(toast?.action).toMatchObject({
      label: 'Add API key',
      altText: 'Open API keys in the header to add your Anthropic key',
    });
    expect(onAddApiKey).toHaveBeenCalledWith('anthropic');
  });

  it('offers no API key for a provider that takes none', () => {
    const toast = runFailureToast(
      finished('error', statuses(), KEY_REJECTED),
      askPipeline('mock'),
      vi.fn(),
    );

    expect(toast?.action).toBeUndefined();
  });

  it('says that a broken run failed', () => {
    expect(runFailureToast({ type: 'broken' }, askPipeline(), vi.fn())).toEqual({
      tone: 'danger',
      title: 'Run failed',
      description: 'Something went wrong while running the pipeline.',
    });
  });
});
