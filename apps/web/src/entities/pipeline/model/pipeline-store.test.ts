import {
  addNode,
  connect,
  type ConnectionCandidate,
  createEmptyPipeline,
  type Pipeline,
} from '@pipeline-builder/core';
import { describe, expect, it, vi } from 'vitest';

import { createPipelineStore } from './pipeline-store';

function connected(pipeline: Pipeline, candidate: ConnectionCandidate, edgeId: string): Pipeline {
  const result = connect(pipeline, candidate, edgeId);
  if (!result.ok) throw new Error(`Cannot connect: ${result.error}`);
  return result.value.pipeline;
}

/** Input → Prompt → LLM Call. */
function chain(): Pipeline {
  let pipeline = createEmptyPipeline({ id: 'draft', name: 'Test' });
  pipeline = addNode(pipeline, { kind: 'input', id: 'input', position: { x: 0, y: 0 } }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'prompt',
    id: 'prompt',
    position: { x: 300, y: 0 },
  }).pipeline;
  pipeline = addNode(pipeline, {
    kind: 'llm-call',
    id: 'llm',
    position: { x: 600, y: 0 },
  }).pipeline;
  pipeline = connected(
    pipeline,
    { source: 'input', sourcePort: 'value', target: 'prompt', targetPort: 'question' },
    'input-prompt',
  );
  return connected(
    pipeline,
    { source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'prompt' },
    'prompt-llm',
  );
}

function storeWithListener(pipeline = chain()) {
  const store = createPipelineStore(pipeline, { createId: () => 'new' });
  const listener = vi.fn();
  store.subscribe(listener);
  return { store, listener };
}

describe('createPipelineStore', () => {
  it('starts with the pipeline and no view state', () => {
    const pipeline = chain();
    const state = createPipelineStore(pipeline).getState();

    expect(state.pipeline).toBe(pipeline);
    expect(state.selectedNodeIds.size).toBe(0);
    expect(state.selectedEdgeIds.size).toBe(0);
    expect(state.measured.size).toBe(0);
    expect(state.dragPositions.size).toBe(0);
  });

  it('adds a numbered node with a generated id and returns it', () => {
    const { store } = storeWithListener();

    const node = store.getState().addNode('prompt', { x: 40, y: 80 });

    expect(node).toMatchObject({ id: 'new', kind: 'prompt', label: 'Prompt 2' });
    expect(node.position).toEqual({ x: 40, y: 80 });
    expect(store.getState().pipeline.nodes.at(-1)).toBe(node);
  });

  it('keeps dragged positions out of the pipeline until the nodes are moved', () => {
    const { store } = storeWithListener();
    const pipeline = store.getState().pipeline;

    store.getState().dragNodes(new Map([['input', { x: 10, y: 20 }]]));
    store.getState().dragNodes(new Map([['input', { x: 15, y: 25 }]]));

    expect(store.getState().pipeline).toBe(pipeline);
    expect(store.getState().dragPositions).toEqual(new Map([['input', { x: 15, y: 25 }]]));

    store.getState().moveNodes(new Map([['input', { x: 15, y: 25 }]]));

    expect(store.getState().pipeline.nodes[0]?.position).toEqual({ x: 15, y: 25 });
    expect(store.getState().dragPositions.size).toBe(0);
  });

  it('ends a drag that returns the node to where it started', () => {
    const { store } = storeWithListener();
    const pipeline = store.getState().pipeline;
    store.getState().dragNodes(new Map([['input', { x: 10, y: 20 }]]));

    store.getState().moveNodes(new Map([['input', { x: 0, y: 0 }]]));

    expect(store.getState().pipeline).toBe(pipeline);
    expect(store.getState().dragPositions.size).toBe(0);
  });

  it('removes nodes with their edges and forgets their view state', () => {
    const { store } = storeWithListener();
    const { updateSelection, setMeasured, dragNodes } = store.getState();
    updateSelection({
      nodes: new Map([
        ['input', true],
        ['prompt', true],
      ]),
      edges: new Map([['prompt-llm', true]]),
    });
    setMeasured(
      new Map([
        ['prompt', { width: 240, height: 120 }],
        ['llm', { width: 240, height: 140 }],
      ]),
    );
    dragNodes(new Map([['prompt', { x: 1, y: 1 }]]));

    store.getState().removeElements({ nodeIds: ['prompt'] });

    const state = store.getState();
    expect(state.pipeline.nodes.map((node) => node.id)).toEqual(['input', 'llm']);
    expect(state.pipeline.edges).toEqual([]);
    expect([...state.selectedNodeIds]).toEqual(['input']);
    expect(state.selectedEdgeIds.size).toBe(0);
    expect([...state.measured.keys()]).toEqual(['llm']);
    expect(state.dragPositions.size).toBe(0);
  });

  it('removes edges alone', () => {
    const { store } = storeWithListener();

    store.getState().removeElements({ edgeIds: ['input-prompt'] });

    expect(store.getState().pipeline.nodes).toHaveLength(3);
    expect(store.getState().pipeline.edges.map((edge) => edge.id)).toEqual(['prompt-llm']);
  });

  it('tells which ports can be connected', () => {
    const { store } = storeWithListener();
    const { canConnect } = store.getState();

    expect(
      canConnect({ source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'system' }),
    ).toBe(true);
    // An occupied input can be connected: the new edge replaces the old one.
    expect(
      canConnect({ source: 'input', sourcePort: 'value', target: 'llm', targetPort: 'prompt' }),
    ).toBe(true);
    expect(
      canConnect({ source: 'llm', sourcePort: 'response', target: 'llm', targetPort: 'system' }),
    ).toBe(false);
    expect(
      canConnect({ source: 'input', sourcePort: 'value', target: 'llm', targetPort: 'missing' }),
    ).toBe(false);
  });

  it('connects ports with an edge of a generated id', () => {
    const { store } = storeWithListener();

    store
      .getState()
      .connect({ source: 'prompt', sourcePort: 'prompt', target: 'llm', targetPort: 'system' });

    expect(store.getState().pipeline.edges.at(-1)).toEqual({
      id: 'new',
      source: 'prompt',
      sourcePort: 'prompt',
      target: 'llm',
      targetPort: 'system',
    });
  });

  it('replaces the edge of an occupied input and forgets its selection', () => {
    const { store } = storeWithListener();
    store.getState().updateSelection({ edges: new Map([['prompt-llm', true]]) });

    store
      .getState()
      .connect({ source: 'input', sourcePort: 'value', target: 'llm', targetPort: 'prompt' });

    const state = store.getState();
    expect(state.pipeline.edges.map((edge) => edge.id)).toEqual(['input-prompt', 'new']);
    expect(state.pipeline.edges[1]).toMatchObject({ source: 'input', target: 'llm' });
    expect(state.selectedEdgeIds.size).toBe(0);
  });

  it('selects and deselects nodes and edges', () => {
    const { store } = storeWithListener();

    store.getState().updateSelection({
      nodes: new Map([
        ['input', true],
        ['prompt', true],
      ]),
      edges: new Map([['input-prompt', true]]),
    });
    store.getState().updateSelection({
      nodes: new Map([['input', false]]),
      edges: new Map([['input-prompt', false]]),
    });

    expect([...store.getState().selectedNodeIds]).toEqual(['prompt']);
    expect(store.getState().selectedEdgeIds.size).toBe(0);
  });

  it('records node sizes', () => {
    const { store } = storeWithListener();

    store.getState().setMeasured(new Map([['input', { width: 240, height: 96 }]]));
    store.getState().setMeasured(new Map([['input', { width: 240, height: 120 }]]));

    expect(store.getState().measured).toEqual(new Map([['input', { width: 240, height: 120 }]]));
  });

  it('notifies nobody when an action changes nothing', () => {
    const { store, listener } = storeWithListener();
    const { updateSelection, setMeasured, dragNodes } = store.getState();
    updateSelection({ nodes: new Map([['input', true]]) });
    setMeasured(new Map([['input', { width: 240, height: 96 }]]));
    dragNodes(new Map([['prompt', { x: 10, y: 20 }]]));
    listener.mockClear();

    const actions = store.getState();
    actions.dragNodes(new Map());
    actions.dragNodes(new Map([['prompt', { x: 10, y: 20 }]]));
    actions.moveNodes(new Map([['input', { x: 0, y: 0 }]]));
    actions.moveNodes(new Map([['missing', { x: 5, y: 5 }]]));
    actions.removeElements({ nodeIds: ['missing'], edgeIds: ['missing'] });
    actions.connect({
      source: 'input',
      sourcePort: 'value',
      target: 'prompt',
      targetPort: 'question',
    });
    actions.connect({ source: 'llm', sourcePort: 'response', target: 'llm', targetPort: 'system' });
    actions.updateSelection({ nodes: new Map([['input', true]]), edges: new Map() });
    actions.updateSelection({ nodes: new Map([['prompt', false]]) });
    actions.setMeasured(new Map([['input', { width: 240, height: 96 }]]));

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps no view state for elements outside the pipeline', () => {
    const { store, listener } = storeWithListener();

    const actions = store.getState();
    actions.dragNodes(new Map([['missing', { x: 1, y: 1 }]]));
    actions.updateSelection({
      nodes: new Map([['missing', true]]),
      edges: new Map([['missing', true]]),
    });
    actions.setMeasured(new Map([['missing', { width: 240, height: 96 }]]));

    expect(listener).not.toHaveBeenCalled();
  });
});
