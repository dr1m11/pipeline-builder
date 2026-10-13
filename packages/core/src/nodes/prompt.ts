import * as z from 'zod';

import { extractTemplateVariables } from '../template';
import { isBlank, REQUIRED_MESSAGE } from './field-rules';
import type { NodeDefinition } from './node-definition';

/** Data of a Prompt node. */
export interface PromptNodeData {
  /** Text with `{{variable}}` placeholders; each variable becomes a required text input. */
  readonly template: string;
}

export const PROMPT_DATA_SCHEMA = z.object({
  template: z.string(),
});

export const PROMPT_RULES_SCHEMA = PROMPT_DATA_SCHEMA.extend({
  template: z.string().refine((template) => !isBlank(template), REQUIRED_MESSAGE),
});

/** Fills a text template from its inputs. */
export const PROMPT_DEFINITION: NodeDefinition<PromptNodeData> = {
  title: 'Prompt',
  description: 'A text template; every {{variable}} in it becomes an input.',
  createData: () => ({ template: 'Answer the question: {{question}}' }),
  getPorts: ({ template }) => ({
    inputs: extractTemplateVariables(template).map((name) => ({
      id: name,
      label: name,
      type: 'text',
      required: true,
    })),
    outputs: [{ id: 'prompt', label: 'prompt', type: 'text', required: false }],
  }),
  dataSchema: PROMPT_DATA_SCHEMA,
  rulesSchema: PROMPT_RULES_SCHEMA,
  fields: {
    template: {
      label: 'Template',
      description: 'Every {{variable}} becomes an input of the node.',
      multiline: true,
    },
  },
};
