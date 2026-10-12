import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { describeNode, labelNamesKind } from './describe-node';

function nodeWith<K extends NodeKind>(kind: K, data: Partial<NodeDataMap[K]>): NodeOfKind<K> {
  return {
    id: kind,
    kind,
    label: kind,
    position: { x: 0, y: 0 },
    data: { ...NODE_DEFINITIONS[kind].createData(), ...data },
  };
}

describe('describeNode', () => {
  it('shows the value of an Input, or that it is empty', () => {
    expect(describeNode(nodeWith('input', {}))).toBe('Empty text value');
    expect(describeNode(nodeWith('input', { valueType: 'json' }))).toBe('Empty json value');
    expect(describeNode(nodeWith('input', { value: 'What is RAG?' }))).toBe('What is RAG?');
  });

  it('shows the template of a Prompt', () => {
    expect(describeNode(nodeWith('prompt', {}))).toBe('Answer the question: {{question}}');
    expect(describeNode(nodeWith('prompt', { template: '' }))).toBe('Empty template');
  });

  it('shows the model and temperature of an LLM Call', () => {
    expect(describeNode(nodeWith('llm-call', {}))).toBe('mock · temperature 0.7');
  });

  it('names the operation of a Transform', () => {
    expect(describeNode(nodeWith('transform', {}))).toBe('Parse JSON');
    expect(describeNode(nodeWith('transform', { operation: 'stringify' }))).toBe('Stringify JSON');
    expect(describeNode(nodeWith('transform', { operation: 'trim' }))).toBe('Trim text');
    expect(describeNode(nodeWith('transform', { operation: 'get-field' }))).toBe(
      'Get field (no path)',
    );
    expect(describeNode(nodeWith('transform', { operation: 'get-field', path: 'user.name' }))).toBe(
      'Get field user.name',
    );
  });

  it('shows the check of a Condition', () => {
    expect(describeNode(nodeWith('condition', { operand: 'yes' }))).toBe('Contains "yes"');
    expect(describeNode(nodeWith('condition', { operator: 'equals', operand: '42' }))).toBe(
      'Equals "42"',
    );
    expect(describeNode(nodeWith('condition', { operator: 'is-empty' }))).toBe('Is empty');
  });

  it('shows the format of an Output', () => {
    expect(describeNode(nodeWith('output', {}))).toBe('Shows text');
    expect(describeNode(nodeWith('output', { format: 'markdown' }))).toBe('Shows Markdown');
  });
});

describe('labelNamesKind', () => {
  it('accepts the bare title and default numbered labels', () => {
    expect(labelNamesKind('Prompt', 'Prompt')).toBe(true);
    expect(labelNamesKind('Prompt 1', 'Prompt')).toBe(true);
    expect(labelNamesKind('LLM Call 12', 'LLM Call')).toBe(true);
  });

  it('rejects labels that only start with the title', () => {
    const cases = [
      ['Input data', 'Input'],
      ['Prompting guide', 'Prompt'],
      ['Prompt 01', 'Prompt'],
      ['Prompt 2b', 'Prompt'],
      ['Prompt ', 'Prompt'],
    ] as const;
    for (const [label, title] of cases) {
      expect(labelNamesKind(label, title)).toBe(false);
    }
  });
});
