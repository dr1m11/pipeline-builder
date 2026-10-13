import { describe, expect, expectTypeOf, it } from 'vitest';
import * as z from 'zod';

import {
  PROMPT_DATA_SCHEMA,
  PROMPT_DEFINITION,
  PROMPT_RULES_SCHEMA,
  type PromptNodeData,
} from './prompt';

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

describe('PROMPT_DATA_SCHEMA', () => {
  it('describes exactly the Prompt data type', () => {
    expectTypeOf<PromptNodeData>().toExtend<z.output<typeof PROMPT_DATA_SCHEMA>>();
    expectTypeOf<z.output<typeof PROMPT_DATA_SCHEMA>>().toExtend<PromptNodeData>();
    expectTypeOf<z.output<typeof PROMPT_RULES_SCHEMA>>().toExtend<PromptNodeData>();
  });

  it('accepts a blank template', () => {
    expect(PROMPT_DATA_SCHEMA.safeParse({ template: '' }).success).toBe(true);
  });
});

describe('PROMPT_RULES_SCHEMA', () => {
  it('accepts the default template', () => {
    expect(PROMPT_RULES_SCHEMA.safeParse(PROMPT_DEFINITION.createData()).success).toBe(true);
  });

  it('requires a template that is not blank', () => {
    const result = PROMPT_RULES_SCHEMA.safeParse({ template: '  ' });
    expect(result.success ? {} : z.flattenError(result.error).fieldErrors).toEqual({
      template: ['Required'],
    });
  });
});
