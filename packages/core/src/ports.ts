/** Types of values that flow between nodes, in display order. */
export const PORT_TYPES = ['text', 'number', 'json', 'any'] as const;

/** Type of a port: what kind of value it carries. */
export type PortType = (typeof PORT_TYPES)[number];

/** An input or output of a node. */
export interface PortDefinition {
  /** Unique among the node's inputs (or outputs); edges reference it as `sourcePort` / `targetPort`. */
  readonly id: string;
  readonly label: string;
  readonly type: PortType;
  /** The input must be connected before the pipeline can run. Always `false` for outputs. */
  readonly required: boolean;
}

/** Inputs and outputs of a node, in display order. */
export interface NodePorts {
  readonly inputs: readonly PortDefinition[];
  readonly outputs: readonly PortDefinition[];
}

/**
 * Whether an output of type `source` may feed an input of type `target`:
 * the types match, or either side is `any`. Conversions go through a Transform node.
 */
export function arePortTypesCompatible(source: PortType, target: PortType): boolean {
  return source === target || source === 'any' || target === 'any';
}
