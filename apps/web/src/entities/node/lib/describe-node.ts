import { assertNever, type PipelineNode, type TransformOperation } from '@pipeline-builder/core';

const TRANSFORM_LABELS: Record<Exclude<TransformOperation, 'get-field'>, string> = {
  'parse-json': 'Parse JSON',
  stringify: 'Stringify JSON',
  trim: 'Trim text',
};

/** One-line summary of a node's settings, shown on its card. */
export function describeNode(node: PipelineNode): string {
  switch (node.kind) {
    case 'input':
      return node.data.value === '' ? `Empty ${node.data.valueType} value` : node.data.value;
    case 'prompt':
      return node.data.template === '' ? 'Empty template' : node.data.template;
    case 'llm-call':
      return `${node.data.model} · temperature ${String(node.data.temperature)}`;
    case 'transform':
      return node.data.operation === 'get-field'
        ? `Get field ${node.data.path === '' ? '(no path)' : node.data.path}`
        : TRANSFORM_LABELS[node.data.operation];
    case 'condition':
      return node.data.operator === 'is-empty'
        ? 'Is empty'
        : `${node.data.operator === 'contains' ? 'Contains' : 'Equals'} "${node.data.operand}"`;
    case 'output':
      return node.data.format === 'markdown' ? 'Shows Markdown' : 'Shows text';
    default:
      return assertNever(node);
  }
}
