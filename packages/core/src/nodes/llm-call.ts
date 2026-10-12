import type { NodePorts } from '../ports';
import type { NodeDefinition } from './node-definition';

/** Data of an LLM Call node. */
export interface LlmCallNodeData {
  /** Model id passed to the provider; the built-in mock provider accepts any value. */
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
}

const PORTS: NodePorts = {
  inputs: [
    { id: 'prompt', label: 'prompt', type: 'text', required: true },
    { id: 'system', label: 'system prompt', type: 'text', required: false },
  ],
  outputs: [{ id: 'response', label: 'response', type: 'text', required: false }],
};

/** Sends a prompt to a language model and returns its response. */
export const LLM_CALL_DEFINITION: NodeDefinition<LlmCallNodeData> = {
  title: 'LLM Call',
  description: 'Sends the prompt to a language model and streams back its response.',
  createData: () => ({ model: 'mock', temperature: 0.7, maxTokens: 512 }),
  getPorts: () => PORTS,
};
