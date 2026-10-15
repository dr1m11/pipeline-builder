import { addNode, createEmptyPipeline, type Pipeline } from '@pipeline-builder/core';
import { act, render, screen, within } from '@testing-library/react';
import { createElement, type FunctionComponent, Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type * as NodeEntity from '@/entities/node';
import { createPipelineStore, PipelineStoreProvider } from '@/entities/pipeline';
import type * as RunEntity from '@/entities/run';
import { createRunStore, RunStoreProvider } from '@/entities/run';

import { PipelineCanvas } from './PipelineCanvas';

// Renders by node id of the card and of each piece of run UI the canvas composes into it.
const renders = vi.hoisted(() => ({
  cards: new Map<string, number>(),
  badges: new Map<string, number>(),
  descriptions: new Map<string, number>(),
  previews: new Map<string, number>(),
}));

function count(counts: Map<string, number>, nodeId: string): void {
  counts.set(nodeId, (counts.get(nodeId) ?? 0) + 1);
}

/**
 * `component` with a profiler that counts its renders by node id in `counts`, including those it
 * makes on its own, as a subscriber of the run store.
 */
function profiled<P extends object>(
  component: FunctionComponent<P>,
  counts: Map<string, number>,
  nodeIdOf: (props: P) => string,
): FunctionComponent<P> {
  return function Profiled(props: P) {
    return createElement(
      Profiler,
      {
        id: nodeIdOf(props),
        onRender: (id) => {
          count(counts, id);
        },
      },
      createElement(component, props),
    );
  };
}

// The real components, wrapped to count their renders. The card is counted when the canvas renders
// it again, not when the run UI inside it does.
vi.mock('@/entities/node', async (importOriginal) => {
  const original = await importOriginal<typeof NodeEntity>();
  return {
    ...original,
    PipelineNodeView: (props: NodeEntity.PipelineNodeViewProps) => {
      count(renders.cards, props.id);
      return createElement(original.PipelineNodeView, props);
    },
  };
});

vi.mock('@/entities/run', async (importOriginal) => {
  const original = await importOriginal<typeof RunEntity>();
  return {
    ...original,
    NodeRunBadge: profiled(original.NodeRunBadge, renders.badges, ({ nodeId }) => nodeId),
    NodeRunDescription: profiled(
      original.NodeRunDescription,
      renders.descriptions,
      ({ nodeId }) => nodeId,
    ),
    NodeRunPreview: profiled(original.NodeRunPreview, renders.previews, ({ nodeId }) => nodeId),
  };
});

const NODE_COUNT = 50;

/** `NODE_COUNT` LLM Calls in a grid, with ids `llm-0`, `llm-1`… */
function manyLlmCalls(): Pipeline {
  return Array.from({ length: NODE_COUNT }).reduce<Pipeline>(
    (pipeline, _, index) =>
      addNode(pipeline, {
        kind: 'llm-call',
        id: `llm-${String(index)}`,
        position: { x: (index % 10) * 300, y: Math.floor(index / 10) * 300 },
      }).pipeline,
    createEmptyPipeline({ id: 'draft', name: 'Test' }),
  );
}

// Rendering 50 nodes in jsdom, and querying them by role, takes seconds on a busy machine.
const TIMEOUT_MS = 30_000;

describe('CanvasNode', () => {
  it(
    're-renders only the run text of the node a token streams into, in a pipeline of 50 nodes',
    {
      timeout: TIMEOUT_MS,
    },
    async () => {
      const runStore = createRunStore();
      render(
        <PipelineStoreProvider store={createPipelineStore(manyLlmCalls())}>
          <RunStoreProvider store={runStore}>
            <div style={{ width: 1200, height: 600 }}>
              <PipelineCanvas />
            </div>
          </RunStoreProvider>
        </PipelineStoreProvider>,
      );
      // React Flow shows nodes once it has measured them; the last one comes last.
      await screen.findByRole(
        'group',
        { name: `LLM Call ${String(NODE_COUNT)}` },
        {
          timeout: TIMEOUT_MS,
        },
      );
      expect(screen.getAllByRole('group', { name: /^LLM Call \d+$/ })).toHaveLength(NODE_COUNT);
      act(() => {
        runStore.getState().start();
        runStore.getState().applyEvents([
          ...Array.from({ length: NODE_COUNT }, (_, index) => ({
            type: 'node-status' as const,
            nodeId: `llm-${String(index)}`,
            status: 'queued' as const,
          })),
          { type: 'node-status', nodeId: 'llm-25', status: 'running' },
        ]);
      });
      for (const counts of Object.values(renders)) counts.clear();

      const tokens = [
        'The ',
        'sky ',
        'is ',
        'blue ',
        'because ',
        'of ',
        'Rayleigh ',
        'scattering.',
      ];
      for (const text of tokens) {
        act(() => {
          runStore.getState().applyEvents([{ type: 'node-delta', nodeId: 'llm-25', text }]);
        });
      }

      const streaming = screen.getByRole('group', { name: 'LLM Call 26' });
      expect(within(streaming).getByRole('textbox').textContent).toBe(tokens.join(''));
      // The text of the streaming node renders once per token; nothing else renders at all.
      expect([...renders.previews]).toEqual([['llm-25', tokens.length]]);
      expect(renders.cards.size).toBe(0);
      expect(renders.badges.size).toBe(0);
      expect(renders.descriptions.size).toBe(0);
    },
  );
});
