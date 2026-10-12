import {
  assertNever,
  type ConditionOperator,
  type OutputFormat,
  type PipelineNode,
  type TransformOperation,
} from '@pipeline-builder/core';

// Records rather than ternaries, so a new operation or format fails to compile until it has a label.
const TRANSFORM_LABELS: Record<Exclude<TransformOperation, 'get-field'>, string> = {
  'parse-json': 'Parse JSON',
  stringify: 'Stringify JSON',
  trim: 'Trim text',
};

const CONDITION_LABELS: Record<Exclude<ConditionOperator, 'is-empty'>, string> = {
  contains: 'Contains',
  equals: 'Equals',
};

const OUTPUT_LABELS: Record<OutputFormat, string> = {
  text: 'Shows text',
  markdown: 'Shows Markdown',
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
        : `${CONDITION_LABELS[node.data.operator]} "${node.data.operand}"`;
    case 'output':
      return OUTPUT_LABELS[node.data.format];
    default:
      return assertNever(node);
  }
}

/** Whether the label already names the kind: the bare title or a default label ("Prompt 2"). */
export function labelNamesKind(label: string, title: string): boolean {
  if (label === title) return true;
  const prefix = `${title} `;
  return label.startsWith(prefix) && /^[1-9][0-9]*$/.test(label.slice(prefix.length));
}
