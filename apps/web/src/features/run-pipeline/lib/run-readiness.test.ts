import {
  addNode,
  createEmptyPipeline,
  type LlmProvider,
  type Pipeline,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { findMissingApiKey, runBlocker, stepBlockers } from './run-readiness';

describe('runBlocker', () => {
  it('asks to fix the errors first', () => {
    expect(runBlocker(3, { errorCount: 1 })).toBe('Fix 1 error to run');
    expect(runBlocker(3, { errorCount: 2 })).toBe('Fix 2 errors to run');
  });

  it('asks for a node in an empty pipeline', () => {
    expect(runBlocker(0, { errorCount: 0 })).toBe('Add a node to run');
  });

  it('lets a pipeline without errors run', () => {
    expect(runBlocker(1, { errorCount: 0 })).toBeNull();
  });
});

/** A pipeline with an LLM Call for each of `providers`, in order. */
function llmCalls(...providers: readonly LlmProvider[]): Pipeline {
  return providers.reduce(
    (pipeline, provider, index) => {
      const added = addNode(pipeline, {
        kind: 'llm-call',
        id: `llm-${String(index)}`,
        position: { x: 0, y: index * 200 },
      }).pipeline;
      return {
        ...added,
        nodes: added.nodes.map((node) =>
          node.id === `llm-${String(index)}` && node.kind === 'llm-call'
            ? { ...node, data: { ...node.data, provider } }
            : node,
        ),
      };
    },
    createEmptyPipeline({ id: 'test', name: 'Test' }),
  );
}

describe('findMissingApiKey', () => {
  const keys =
    (saved: Partial<Record<LlmProvider, string>>) =>
    (provider: LlmProvider): string | null =>
      saved[provider] ?? null;

  it('finds the first provider whose key is missing, in node order', () => {
    expect(findMissingApiKey(llmCalls('mock', 'openai', 'anthropic'), keys({}))).toBe('openai');
    expect(findMissingApiKey(llmCalls('openai', 'anthropic'), keys({ openai: 'sk-openai' }))).toBe(
      'anthropic',
    );
  });

  it('needs no key for the mock provider or a pipeline without LLM Calls', () => {
    expect(findMissingApiKey(llmCalls('mock'), keys({}))).toBeNull();
    const withoutLlm = addNode(createEmptyPipeline({ id: 'test', name: 'Test' }), {
      kind: 'input',
      id: 'input',
      position: { x: 0, y: 0 },
    }).pipeline;
    expect(findMissingApiKey(withoutLlm, keys({}))).toBeNull();
  });

  it('finds nothing missing when every key is saved', () => {
    expect(
      findMissingApiKey(
        llmCalls('anthropic', 'openai'),
        keys({ anthropic: 'sk-ant', openai: 'sk-openai' }),
      ),
    ).toBeNull();
  });
});

describe('stepBlockers', () => {
  it('asks for a run first', () => {
    for (const status of ['idle', 'done', 'cancelled'] as const) {
      expect(stepBlockers({ status, stepping: false, pausedNodeId: null })).toEqual({
        next: 'Run the pipeline to step through it',
        continue: 'Run the pipeline to step through it',
      });
    }
  });

  it('offers nothing in a run that does not pause', () => {
    expect(stepBlockers({ status: 'running', stepping: false, pausedNodeId: null })).toEqual({
      next: 'The run goes on without pausing',
      continue: 'The run goes on without pausing',
    });
  });

  it('offers Continue while a node runs, and Next step once the run pauses', () => {
    expect(stepBlockers({ status: 'running', stepping: true, pausedNodeId: null })).toEqual({
      next: 'A node is running',
      continue: null,
    });
    expect(stepBlockers({ status: 'running', stepping: true, pausedNodeId: 'model' })).toEqual({
      next: null,
      continue: null,
    });
  });
});
