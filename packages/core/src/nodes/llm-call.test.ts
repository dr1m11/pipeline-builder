import { describe, expect, it } from 'vitest';

import { LLM_CALL_DEFINITION } from './llm-call';

describe('LLM_CALL_DEFINITION', () => {
  it('starts with the mock model and moderate settings', () => {
    expect(LLM_CALL_DEFINITION.createData()).toEqual({
      model: 'mock',
      temperature: 0.7,
      maxTokens: 512,
    });
  });

  it('requires a text prompt, accepts an optional system prompt and outputs text', () => {
    expect(LLM_CALL_DEFINITION.getPorts(LLM_CALL_DEFINITION.createData())).toEqual({
      inputs: [
        { id: 'prompt', label: 'prompt', type: 'text', required: true },
        { id: 'system', label: 'system prompt', type: 'text', required: false },
      ],
      outputs: [{ id: 'response', label: 'response', type: 'text', required: false }],
    });
  });
});
