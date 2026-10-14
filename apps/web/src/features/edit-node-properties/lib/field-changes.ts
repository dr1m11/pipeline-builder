import { isLlmProvider, llmProviderChanges, type PipelineNode } from '@pipeline-builder/core';

/**
 * The data changes that setting data field `field` of `node` to `value` makes, to apply as one
 * change and so one undo step. Usually just that field; switching an LLM Call's provider also
 * moves a blank or default model to the new provider's default.
 */
export function fieldChanges(
  node: PipelineNode,
  field: string,
  value: unknown,
): Readonly<Record<string, unknown>> {
  if (node.kind === 'llm-call' && field === 'provider' && isLlmProvider(value)) {
    return llmProviderChanges(node.data, value);
  }
  return { [field]: value };
}
