import { getNodePorts, NODE_DEFINITIONS, type PipelineNode } from '@pipeline-builder/core';

import { cn } from '@/shared/lib/cn';

import { describeNode, labelNamesKind } from '../lib/describe-node';
import { NodeKindIcon } from './NodeKindIcon';
import { PortHandle } from './PortHandle';

export interface NodeCardProps {
  node: PipelineNode;
  selected?: boolean;
}

/** Card of a node on the canvas: kind icon, label, a summary of its settings and its ports. */
export function NodeCard({ node, selected = false }: NodeCardProps) {
  const { inputs, outputs } = getNodePorts(node);
  const { title } = NODE_DEFINITIONS[node.kind];

  return (
    <div
      className={cn(
        'w-60 rounded-lg border border-border bg-surface text-fg shadow-elevated',
        // React Flow focuses the node wrapper; draw the ring on the card so it follows the corners.
        'in-focus-visible:outline-2 in-focus-visible:outline-offset-2 in-focus-visible:outline-focus',
        selected && 'border-accent ring-1 ring-accent',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <NodeKindIcon kind={node.kind} className="size-4 shrink-0 text-fg-muted" />
        <span className="truncate text-sm font-semibold">{node.label}</span>
        {!labelNamesKind(node.label, title) && (
          <span className="ml-auto shrink-0 text-xs text-fg-muted">{title}</span>
        )}
      </div>
      <p className="truncate border-b border-border px-3 py-1.5 text-xs text-fg-muted">
        {describeNode(node)}
      </p>
      <div className="py-1.5 text-xs">
        {inputs.map((port) => (
          <div key={`input-${port.id}`} className="relative flex items-center gap-1.5 px-4 py-1">
            <PortHandle port={port} direction="input" />
            <span className="truncate">{port.label}</span>
            <span className="text-fg-muted">{port.type}</span>
          </div>
        ))}
        {outputs.map((port) => (
          <div
            key={`output-${port.id}`}
            className="relative flex items-center justify-end gap-1.5 px-4 py-1"
          >
            <span className="text-fg-muted">{port.type}</span>
            <span className="truncate">{port.label}</span>
            <PortHandle port={port} direction="output" />
          </div>
        ))}
      </div>
    </div>
  );
}
