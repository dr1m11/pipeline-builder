import { describe, expect, it } from 'vitest';

import { PROMPT_DEFINITION } from './prompt';

describe('PROMPT_DEFINITION', () => {
  it('starts with a template that has one variable', () => {
    const data = PROMPT_DEFINITION.createData();
    expect(data).toEqual({ template: 'Answer the question: {{question}}' });
    expect(PROMPT_DEFINITION.getPorts(data).inputs.map((port) => port.id)).toEqual(['question']);
  });

  it('turns every template variable into a required text input', () => {
    const ports = PROMPT_DEFINITION.getPorts({ template: 'Translate {{text}} into {{language}}' });
    expect(ports.inputs).toEqual([
      { id: 'text', label: 'text', type: 'text', required: true },
      { id: 'language', label: 'language', type: 'text', required: true },
    ]);
  });

  it('has no inputs when the template has no variables', () => {
    expect(PROMPT_DEFINITION.getPorts({ template: 'Tell a joke' }).inputs).toEqual([]);
  });

  it('outputs the filled prompt as text', () => {
    expect(PROMPT_DEFINITION.getPorts({ template: '' }).outputs).toEqual([
      { id: 'prompt', label: 'prompt', type: 'text', required: false },
    ]);
  });
});
