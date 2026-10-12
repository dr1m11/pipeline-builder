import { extractTemplateVariables } from '../template';
import type { NodeDefinition } from './node-definition';

/** Data of a Prompt node. */
export interface PromptNodeData {
  /** Text with `{{variable}}` placeholders; each variable becomes a required text input. */
  readonly template: string;
}

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
};
