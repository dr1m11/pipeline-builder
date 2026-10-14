import {
  createNode,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { fieldChanges } from './field-changes';

function nodeOf<K extends NodeKind>(kind: K, data: Partial<NodeDataMap[K]> = {}): NodeOfKind<K> {
  const node = createNode(kind, { id: 'n', label: 'N', position: { x: 0, y: 0 } });
  return { ...node, data: { ...node.data, ...data } };
}

describe('fieldChanges', () => {
  it('changes only the edited field', () => {
    expect(fieldChanges(nodeOf('prompt'), 'template', 'Hi {{name}}')).toEqual({
      template: 'Hi {{name}}',
    });
    expect(fieldChanges(nodeOf('llm-call'), 'temperature', 0.2)).toEqual({ temperature: 0.2 });
  });

  it('gives an LLM Call the default model of its new provider in place of the old default', () => {
    expect(fieldChanges(nodeOf('llm-call'), 'provider', 'anthropic')).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });

  it('keeps the model an LLM Call was given when its provider changes', () => {
    const node = nodeOf('llm-call', { provider: 'anthropic', model: 'claude-opus-5-5' });
    expect(fieldChanges(node, 'provider', 'openai')).toEqual({ provider: 'openai' });
  });

  it('leaves a provider the app does not know for the store to refuse', () => {
    expect(fieldChanges(nodeOf('llm-call'), 'provider', 'gemini')).toEqual({ provider: 'gemini' });
  });

  it('treats a field named "provider" of another kind as any other field', () => {
    expect(fieldChanges(nodeOf('prompt'), 'provider', 'anthropic')).toEqual({
      provider: 'anthropic',
    });
  });
});
