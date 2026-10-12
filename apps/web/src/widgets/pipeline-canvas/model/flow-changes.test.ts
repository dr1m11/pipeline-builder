import {
  addNode,
  connect,
  createEmptyPipeline,
  createNode,
  type Pipeline,
} from '@pipeline-builder/core';
import type { EdgeChange, NodeChange } from '@xyflow/react';
import { describe, expect, it } from 'vitest';

import { type PipelineFlowNode, toFlowNode } from '@/entities/node';
import { createPipelineStore } from '@/entities/pipeline';

import { translateEdgeChanges, translateNodeChanges } from './flow-changes';
import type { PipelineFlowEdge } from './flow-elements';

/** Input → Prompt. */
function pair(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'draft', name: 'Test' });
  pipeline = addNode(pipeline, { kind: 'input', id: 'input', position: { x: 0, y: 0 } }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 300, y: 0 },
  }).pipeline;
  const result = connect(
    pipeline,
    { source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
    'edge',
  );
  if (!result.ok) throw new Error(result.error);
  return result.value.pipeline;
}

function setup() {
  const store = createPipelineStore(pair());
  const pipelines: Pipeline[] = [];
  store.subscribe((state, previous) => {
    if (state.pipeline !== previous.pipeline) pipelines.push(state.pipeline);
  });
  const nodeChanges = (changes: NodeChange<PipelineFlowNode>[]) => {
    translateNodeChanges(changes, store.getState());
  };
  const edgeChanges = (changes: EdgeChange<PipelineFlowEdge>[]) => {
    translateEdgeChanges(changes, store.getState());
  };
  return { store, pipelines, nodeChanges, edgeChanges };
}

describe('translateNodeChanges', () => {
  it('changes the pipeline once per drag, on drop', () => {
    const { store, pipelines, nodeChanges } = setup();

    for (const x of [10, 20, 30]) {
      nodeChanges([
        { id: 'input', type: 'position', position: { x, y: 5 }, dragging: true },
        { id: 'prompt', type: 'position', position: { x: 300 + x, y: 5 }, dragging: true },
      ]);
    }

    expect(pipelines).toHaveLength(0);
    expect(store.getState().dragPositions).toEqual(
      new Map([
        ['input', { x: 30, y: 5 }],
        ['prompt', { x: 330, y: 5 }],
      ]),
    );

    nodeChanges([
      { id: 'input', type: 'position', position: { x: 30, y: 5 }, dragging: false },
      { id: 'prompt', type: 'position', position: { x: 330, y: 5 }, dragging: false },
    ]);

    expect(pipelines).toHaveLength(1);
    expect(store.getState().pipeline.nodes.map((node) => node.position)).toEqual([
      { x: 30, y: 5 },
      { x: 330, y: 5 },
    ]);
    expect(store.getState().dragPositions.size).toBe(0);
  });

  it('moves nodes right away when the change is not part of a drag', () => {
    const { store, pipelines, nodeChanges } = setup();

    nodeChanges([{ id: 'input', type: 'position', position: { x: 5, y: 0 }, dragging: false }]);
    nodeChanges([{ id: 'input', type: 'position', position: { x: 10, y: 0 } }]);

    expect(pipelines).toHaveLength(2);
    expect(store.getState().pipeline.nodes[0]?.position).toEqual({ x: 10, y: 0 });
  });

  it('selects nodes and records their sizes', () => {
    const { store, nodeChanges } = setup();

    nodeChanges([
      { id: 'input', type: 'select', selected: true },
      { id: 'input', type: 'dimensions', dimensions: { width: 240, height: 96 } },
      { id: 'prompt', type: 'dimensions' },
      { id: 'prompt', type: 'position' },
    ]);

    expect([...store.getState().selectedNodeIds]).toEqual(['input']);
    expect(store.getState().measured).toEqual(new Map([['input', { width: 240, height: 96 }]]));
    expect(store.getState().dragPositions.size).toBe(0);
  });

  it('ignores removals, additions and replacements', () => {
    const { pipelines, nodeChanges } = setup();
    const stray = toFlowNode(
      createNode('output', { id: 'stray', label: 'Output 1', position: { x: 0, y: 0 } }),
    );

    nodeChanges([
      { id: 'input', type: 'remove' },
      { type: 'add', item: stray },
      { id: 'input', type: 'replace', item: stray },
    ]);

    expect(pipelines).toHaveLength(0);
  });
});

describe('translateEdgeChanges', () => {
  it('selects edges and ignores every other change', () => {
    const { store, pipelines, edgeChanges } = setup();

    edgeChanges([
      { id: 'edge', type: 'select', selected: true },
      { id: 'edge', type: 'remove' },
    ]);

    expect([...store.getState().selectedEdgeIds]).toEqual(['edge']);
    expect(pipelines).toHaveLength(0);
  });
});
