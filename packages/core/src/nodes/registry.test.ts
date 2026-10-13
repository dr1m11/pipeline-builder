import { describe, expect, it } from 'vitest';

import {
  createNode,
  getNodePorts,
  isNodeKind,
  nextNodeLabel,
  NODE_DEFINITIONS,
  NODE_KINDS,
  type PipelineNode,
} from './registry';

const ORIGIN = { x: 0, y: 0 };

function nodeWithLabel(label: string): PipelineNode {
  return createNode('prompt', { id: label, label, position: ORIGIN });
}

describe('NODE_KINDS', () => {
  it('lists every registered kind exactly once, in palette order', () => {
    expect(NODE_KINDS).toEqual(['input', 'prompt', 'llm-call', 'transform', 'condition', 'output']);
    expect([...NODE_KINDS].sort()).toEqual(Object.keys(NODE_DEFINITIONS).sort());
  });
});

describe('NODE_DEFINITIONS', () => {
  it.each(NODE_KINDS)('gives "%s" a title, a description and fresh default data', (kind) => {
    const definition = NODE_DEFINITIONS[kind];
    expect(definition.title).not.toBe('');
    expect(definition.description).not.toBe('');
    expect(definition.createData()).not.toBe(definition.createData());
  });

  it.each(NODE_KINDS)('gives the default "%s" node unique, identifier-safe port ids', (kind) => {
    const { inputs, outputs } = getNodePorts(
      createNode(kind, { id: 'n', label: 'n', position: ORIGIN }),
    );
    for (const ports of [inputs, outputs]) {
      const ids = ports.map((port) => port.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
    }
    for (const port of outputs) expect(port.required).toBe(false);
  });

  it.each(NODE_KINDS)('describes every field of "%s" in its schema', (kind) => {
    const definition = NODE_DEFINITIONS[kind];
    const data = definition.createData();
    expect(definition.dataSchema.parse(data)).toEqual(data);
    expect(Object.keys(definition.dataSchema.shape)).toEqual(Object.keys(data));
    expect(Object.keys(definition.fields).sort()).toEqual(Object.keys(data).sort());
  });
});

describe('isNodeKind', () => {
  it('accepts every registered kind', () => {
    for (const kind of NODE_KINDS) expect(isNodeKind(kind)).toBe(true);
  });

  it('rejects unknown values', () => {
    for (const value of ['llm', 'Input', '', 'toString', 42, null, undefined]) {
      expect(isNodeKind(value)).toBe(false);
    }
  });
});

describe('createNode', () => {
  it('creates a node with the default data of its kind', () => {
    expect(
      createNode('transform', { id: 't-1', label: 'Transform 1', position: { x: 4, y: 8 } }),
    ).toEqual({
      id: 't-1',
      kind: 'transform',
      label: 'Transform 1',
      position: { x: 4, y: 8 },
      data: { operation: 'parse-json', path: '' },
    });
  });

  it('does not share data between nodes', () => {
    const first = createNode('input', { id: 'a', label: 'Input 1', position: ORIGIN });
    const second = createNode('input', { id: 'b', label: 'Input 2', position: ORIGIN });
    expect(first.data).not.toBe(second.data);
  });
});

describe('getNodePorts', () => {
  it('derives ports from the node data', () => {
    const prompt = createNode('prompt', { id: 'p', label: 'Prompt 1', position: ORIGIN });
    const edited: PipelineNode = { ...prompt, data: { template: '{{a}} and {{b}}' } };
    expect(getNodePorts(edited).inputs.map((port) => port.id)).toEqual(['a', 'b']);
  });

  it('returns the same ports for the same data and new ones for new data', () => {
    const prompt = createNode('prompt', { id: 'p', label: 'Prompt 1', position: ORIGIN });
    const moved: PipelineNode = { ...prompt, position: { x: 5, y: 5 } };
    const edited: PipelineNode = { ...prompt, data: { template: '{{a}}' } };
    expect(getNodePorts(moved)).toBe(getNodePorts(prompt));
    expect(getNodePorts(edited)).not.toBe(getNodePorts(prompt));
    expect(getNodePorts(edited).inputs.map((port) => port.id)).toEqual(['a']);
  });

  it('dispatches on the kind of a node typed as the union', () => {
    const nodes: PipelineNode[] = NODE_KINDS.map((kind) =>
      createNode(kind, { id: kind, label: kind, position: ORIGIN }),
    );
    expect(nodes.map((node) => getNodePorts(node).outputs.length)).toEqual([1, 1, 1, 1, 2, 0]);
  });
});

describe('nextNodeLabel', () => {
  it('numbers the first node of a kind 1', () => {
    expect(nextNodeLabel('llm-call', [])).toBe('LLM Call 1');
  });

  it('continues after the highest existing number, even with gaps', () => {
    const nodes = ['Prompt 1', 'Prompt 3'].map(nodeWithLabel);
    expect(nextNodeLabel('prompt', nodes)).toBe('Prompt 4');
  });

  it('ignores labels of other kinds and renamed nodes', () => {
    const nodes = ['Input 7', 'Prompt draft', 'Prompt 02', 'Prompt 1.5', 'Prompts 9'].map(
      nodeWithLabel,
    );
    expect(nextNodeLabel('prompt', nodes)).toBe('Prompt 1');
  });
});
