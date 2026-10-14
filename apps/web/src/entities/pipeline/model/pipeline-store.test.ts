import {
  addNode,
  connect,
  type ConnectionCandidate,
  createEmptyPipeline,
  EMPTY_HISTORY,
  extractFragment,
  findNode,
  instantiateFragment,
  MERGE_WINDOW_MS,
  type Pipeline,
  type PipelineElements,
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

/** A store whose clock stands still until `advance` moves it. */
function storeWithClock(pipeline = chain()) {
  let time = 0;
  const store = createPipelineStore(pipeline, { createId: () => 'new', now: () => time });
  return {
    store,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

function labelsOf(entries: readonly { readonly label: string }[]): string[] {
  return entries.map((entry) => entry.label);
}

/** Copies of nodes of `pipeline` and the edges between them, with ids 'copy-1', 'copy-2'… */
function copiesOf(pipeline: Pipeline, nodeIds: readonly string[]): PipelineElements {
  let next = 0;
  return instantiateFragment(extractFragment(pipeline, nodeIds), pipeline, {
    createId: () => `copy-${String(++next)}`,
    offset: { x: 32, y: 32 },
  });
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
    expect(state.documentKey).toBe(0);
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

  it('changes node data, keeping edges whose ports disappear', () => {
    const { store, listener } = storeWithListener();

    store.getState().updateNodeData('prompt', { template: 'Summarize {{text}}' });

    const { pipeline } = store.getState();
    expect(pipeline.nodes.find((node) => node.id === 'prompt')?.data).toEqual({
      template: 'Summarize {{text}}',
    });
    expect(pipeline.edges.map((edge) => edge.id)).toEqual(['input-prompt', 'prompt-llm']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps node data that only breaks a rule', () => {
    const { store } = storeWithListener();

    store.getState().updateNodeData('llm', { temperature: 5 });

    expect(store.getState().pipeline.nodes.find((node) => node.id === 'llm')?.data).toMatchObject({
      temperature: 5,
    });
  });

  it('renames a node with a trimmed label', () => {
    const { store } = storeWithListener();

    store.getState().renameNode('prompt', '  Summarize  ');

    expect(store.getState().pipeline.nodes.find((node) => node.id === 'prompt')?.label).toBe(
      'Summarize',
    );
  });

  it('ignores data and labels that do not fit', () => {
    const { store, listener } = storeWithListener();

    store.getState().updateNodeData('llm', { temperature: 'warm' });
    store.getState().updateNodeData('llm', { colour: 'red' });
    store.getState().updateNodeData('missing', { template: 'x' });
    store.getState().renameNode('prompt', '   ');
    store.getState().renameNode('missing', 'Name');

    expect(listener).not.toHaveBeenCalled();
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

  it('replaces the whole selection', () => {
    const { store } = storeWithListener();
    store.getState().updateSelection({
      nodes: new Map([['input', true]]),
      edges: new Map([['input-prompt', true]]),
    });

    store.getState().select({ nodeIds: ['prompt', 'missing'] });

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
    actions.select({ nodeIds: ['input'] });
    actions.setMeasured(new Map([['input', { width: 240, height: 96 }]]));
    actions.updateNodeData('prompt', { template: 'Answer the question: {{question}}' });
    actions.renameNode('prompt', 'Prompt 1');
    actions.replacePipeline(actions.pipeline, 'import');

    expect(listener).not.toHaveBeenCalled();
  });

  it('records nothing for an action that changes nothing', () => {
    const { store } = storeWithListener();

    const actions = store.getState();
    actions.moveNodes(new Map([['input', { x: 0, y: 0 }]]));
    actions.removeElements({ nodeIds: ['missing'] });
    actions.connect({ source: 'llm', sourcePort: 'response', target: 'llm', targetPort: 'system' });
    actions.updateNodeData('llm', { temperature: 'warm' });
    actions.renameNode('prompt', 'Prompt 1');

    expect(store.getState().history).toBe(EMPTY_HISTORY);
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

describe('createPipelineStore history', () => {
  it('records every change of the pipeline with a label', () => {
    const { store } = storeWithClock();
    const actions = store.getState();

    actions.addNode('output', { x: 900, y: 0 });
    actions.moveNodes(new Map([['input', { x: 10, y: 10 }]]));
    actions.connect({ source: 'llm', sourcePort: 'response', target: 'new', targetPort: 'value' });
    actions.updateNodeData('llm', { temperature: 1 });
    actions.renameNode('prompt', 'Ask');
    actions.removeElements({ edgeIds: ['input-prompt'] });

    expect(labelsOf(store.getState().history.past)).toEqual([
      'Add Output',
      'Move Input 1',
      'Connect LLM Call 1 to Output 1',
      'Edit Temperature of LLM Call 1',
      'Rename Prompt 1',
      'Delete edge from Input 1 to Ask',
    ]);
    expect(store.getState().history.future).toEqual([]);
  });

  it('undoes and redoes a change', () => {
    const { store } = storeWithClock();
    const before = store.getState().pipeline;
    store.getState().updateNodeData('llm', { temperature: 1 });
    const after = store.getState().pipeline;

    store.getState().undo();

    expect(store.getState().pipeline).toBe(before);
    expect(labelsOf(store.getState().history.past)).toEqual([]);
    expect(labelsOf(store.getState().history.future)).toEqual(['Edit Temperature of LLM Call 1']);

    store.getState().redo();

    expect(store.getState().pipeline).toBe(after);
    expect(labelsOf(store.getState().history.past)).toEqual(['Edit Temperature of LLM Call 1']);
    expect(store.getState().history.future).toEqual([]);
  });

  it('makes one step of a field typed within the merge window', () => {
    const { store, advance } = storeWithClock();
    const before = store.getState().pipeline;

    for (const template of ['a', 'ab', 'abc']) {
      store.getState().updateNodeData('prompt', { template });
      advance(MERGE_WINDOW_MS / 2);
    }

    expect(labelsOf(store.getState().history.past)).toEqual(['Edit Template of Prompt 1']);
    store.getState().undo();
    expect(store.getState().pipeline).toBe(before);
  });

  it('makes separate steps of edits further apart than the merge window', () => {
    const { store, advance } = storeWithClock();

    store.getState().renameNode('prompt', 'Ask');
    advance(MERGE_WINDOW_MS + 1);
    store.getState().renameNode('prompt', 'Ask more');

    expect(labelsOf(store.getState().history.past)).toEqual(['Rename Prompt 1', 'Rename Ask']);
  });

  it('records a drag as one step when the nodes are dropped', () => {
    const { store } = storeWithClock();

    store.getState().dragNodes(new Map([['input', { x: 10, y: 10 }]]));
    store.getState().dragNodes(new Map([['input', { x: 20, y: 20 }]]));
    store.getState().moveNodes(new Map([['input', { x: 20, y: 20 }]]));

    expect(labelsOf(store.getState().history.past)).toEqual(['Move Input 1']);
  });

  it('merges arrow-key nudges of the same node', () => {
    const { store, advance } = storeWithClock();
    const before = store.getState().pipeline;

    for (const x of [5, 10, 15]) {
      store.getState().moveNodes(new Map([['input', { x, y: 0 }]]));
      advance(100);
    }
    store.getState().moveNodes(new Map([['prompt', { x: 305, y: 0 }]]));

    expect(labelsOf(store.getState().history.past)).toEqual(['Move Input 1', 'Move Prompt 1']);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().pipeline).toBe(before);
  });

  it('restores removed nodes with their edges on undo', () => {
    const { store } = storeWithClock();
    const before = store.getState().pipeline;

    store.getState().removeElements({ nodeIds: ['prompt'] });
    store.getState().undo();

    const { pipeline } = store.getState();
    expect(pipeline).toBe(before);
    expect(pipeline.nodes.map((node) => node.id)).toEqual(['input', 'prompt', 'llm']);
    expect(pipeline.edges.map((edge) => edge.id)).toEqual(['input-prompt', 'prompt-llm']);
  });

  it('forgets what could be redone once a new change is made', () => {
    const { store } = storeWithClock();
    store.getState().renameNode('prompt', 'Ask');
    store.getState().undo();

    store.getState().renameNode('llm', 'Model');

    expect(labelsOf(store.getState().history.past)).toEqual(['Rename LLM Call 1']);
    expect(store.getState().history.future).toEqual([]);
    store.getState().redo();
    expect(findNode(store.getState().pipeline, 'prompt')?.label).toBe('Prompt 1');
  });

  it('drops the view state of a node whose addition is undone', () => {
    const { store } = storeWithClock();
    const node = store.getState().addNode('output', { x: 900, y: 0 });
    store.getState().select({ nodeIds: [node.id, 'input'] });
    store.getState().setMeasured(new Map([[node.id, { width: 240, height: 96 }]]));

    store.getState().undo();

    const state = store.getState();
    expect(findNode(state.pipeline, node.id)).toBeUndefined();
    expect([...state.selectedNodeIds]).toEqual(['input']);
    expect(state.measured.size).toBe(0);
  });

  it('keeps the view state of elements that stay', () => {
    const { store } = storeWithClock();
    store.getState().select({ nodeIds: ['input'], edgeIds: ['input-prompt'] });
    store.getState().setMeasured(new Map([['input', { width: 240, height: 96 }]]));
    const { selectedNodeIds, selectedEdgeIds, measured } = store.getState();

    store.getState().renameNode('input', 'Question');
    store.getState().undo();
    store.getState().redo();

    const state = store.getState();
    expect(state.selectedNodeIds).toBe(selectedNodeIds);
    expect(state.selectedEdgeIds).toBe(selectedEdgeIds);
    expect(state.measured).toBe(measured);
  });

  it('neither undoes nor redoes while nodes are dragged', () => {
    const { store } = storeWithClock();
    store.getState().renameNode('prompt', 'Ask');
    store.getState().renameNode('llm', 'Model');
    store.getState().undo();
    const { pipeline, history } = store.getState();

    store.getState().dragNodes(new Map([['input', { x: 10, y: 10 }]]));
    store.getState().undo();
    store.getState().redo();

    expect(store.getState().pipeline).toBe(pipeline);
    expect(store.getState().history).toBe(history);
  });

  it('notifies nobody when there is nothing to undo or redo', () => {
    const { store, listener } = storeWithListener();

    store.getState().undo();
    store.getState().redo();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createPipelineStore replacing the document', () => {
  const imported: Pipeline = addNode(createEmptyPipeline({ id: 'imported', name: 'Imported' }), {
    kind: 'output',
    id: 'output',
    position: { x: 0, y: 0 },
  }).pipeline;

  it('replaces the pipeline in one undoable step', () => {
    const { store } = storeWithClock();
    const before = store.getState().pipeline;

    store.getState().replacePipeline(imported, 'import');

    expect(store.getState().pipeline).toBe(imported);
    expect(store.getState().history.past).toMatchObject([
      { label: 'Import “Imported”', before, after: imported, replacesDocument: true },
    ]);
    store.getState().undo();
    expect(store.getState().pipeline).toBe(before);
    store.getState().redo();
    expect(store.getState().pipeline).toBe(imported);
  });

  it('labels the step by why the pipeline was replaced', () => {
    const { store, advance } = storeWithClock();

    store.getState().replacePipeline(imported, 'template');
    advance(MERGE_WINDOW_MS + 1);
    store.getState().replacePipeline(createEmptyPipeline({ id: 'new', name: 'New' }), 'new');

    expect(labelsOf(store.getState().history.past)).toEqual([
      'Load template “Imported”',
      'New pipeline',
    ]);
  });

  it('forgets the selection, sizes and drag positions of the replaced pipeline', () => {
    const { store } = storeWithClock();
    store.getState().select({ nodeIds: ['input'], edgeIds: ['input-prompt'] });
    store.getState().setMeasured(new Map([['input', { width: 240, height: 96 }]]));
    store.getState().dragNodes(new Map([['input', { x: 10, y: 10 }]]));

    // The same id as a node of the replaced pipeline: it is another node all the same.
    store
      .getState()
      .replacePipeline(
        { ...imported, nodes: imported.nodes.map((node) => ({ ...node, id: 'input' })) },
        'import',
      );

    const state = store.getState();
    expect(state.selectedNodeIds.size).toBe(0);
    expect(state.selectedEdgeIds.size).toBe(0);
    expect(state.measured.size).toBe(0);
    expect(state.dragPositions.size).toBe(0);
  });

  it('changes the document key with every replacement, its undo and its redo', () => {
    const { store } = storeWithClock();

    store.getState().replacePipeline(imported, 'import');
    expect(store.getState().documentKey).toBe(1);
    store.getState().undo();
    expect(store.getState().documentKey).toBe(2);
    store.getState().redo();
    expect(store.getState().documentKey).toBe(3);
  });

  it('keeps the document key through other changes and their undo', () => {
    const { store } = storeWithClock();
    store.getState().replacePipeline(imported, 'import');

    store.getState().renameNode('output', 'Answer');
    store.getState().undo();
    store.getState().redo();

    expect(store.getState().documentKey).toBe(1);
  });
});

describe('createPipelineStore clipboard and selection', () => {
  it('inserts copies as one step and makes them the selection', () => {
    const { store } = storeWithClock();
    const before = store.getState().pipeline;
    store.getState().select({ nodeIds: ['llm'] });

    store.getState().insertElements(copiesOf(before, ['input', 'prompt']), 'paste');

    const state = store.getState();
    expect(state.pipeline.nodes.map((node) => node.label)).toEqual([
      'Input 1',
      'Prompt 1',
      'LLM Call 1',
      'Input 2',
      'Prompt 2',
    ]);
    expect(state.pipeline.edges.at(-1)).toMatchObject({ source: 'copy-1', target: 'copy-2' });
    expect([...state.selectedNodeIds]).toEqual(['copy-1', 'copy-2']);
    expect([...state.selectedEdgeIds]).toEqual(['copy-3']);
    expect(labelsOf(state.history.past)).toEqual(['Paste 2 nodes']);

    store.getState().undo();

    expect(store.getState().pipeline).toBe(before);
    expect(store.getState().selectedNodeIds.size).toBe(0);
    expect(store.getState().selectedEdgeIds.size).toBe(0);
  });

  it('names a duplicate in the history', () => {
    const { store } = storeWithClock();

    store.getState().insertElements(copiesOf(store.getState().pipeline, ['llm']), 'duplicate');

    expect(labelsOf(store.getState().history.past)).toEqual(['Duplicate 1 node']);
    expect([...store.getState().selectedNodeIds]).toEqual(['copy-1']);
  });

  it('keeps the selection when there is nothing to insert', () => {
    const { store, listener } = storeWithListener();
    store.getState().select({ nodeIds: ['input'] });
    listener.mockClear();

    store.getState().insertElements({ nodes: [], edges: [] }, 'paste');

    expect(listener).not.toHaveBeenCalled();
    expect(store.getState().history).toBe(EMPTY_HISTORY);
  });

  it('names a removal for the clipboard a cut', () => {
    const { store } = storeWithClock();

    store.getState().removeElements({ nodeIds: ['input', 'prompt'] }, 'cut');
    store.getState().removeElements({ nodeIds: ['llm'] });

    expect(store.getState().pipeline.nodes).toEqual([]);
    expect(labelsOf(store.getState().history.past)).toEqual(['Cut 2 nodes', 'Delete LLM Call 1']);
  });

  it('selects every node and edge, and clears the selection', () => {
    const { store } = storeWithListener();

    store.getState().selectAll();

    expect([...store.getState().selectedNodeIds]).toEqual(['input', 'prompt', 'llm']);
    expect([...store.getState().selectedEdgeIds]).toEqual(['input-prompt', 'prompt-llm']);

    store.getState().clearSelection();

    expect(store.getState().selectedNodeIds.size).toBe(0);
    expect(store.getState().selectedEdgeIds.size).toBe(0);
  });

  it('notifies nobody when the selection is already all or nothing', () => {
    const { store, listener } = storeWithListener();

    store.getState().clearSelection();
    expect(listener).not.toHaveBeenCalled();

    store.getState().selectAll();
    listener.mockClear();
    store.getState().selectAll();
    expect(listener).not.toHaveBeenCalled();
  });
});
