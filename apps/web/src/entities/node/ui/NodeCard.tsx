import {
  EMPTY_ISSUES,
  getNodePorts,
  NODE_DEFINITIONS,
  type PipelineNode,
  type PortDefinition,
  type ValidationIssue,
} from '@pipeline-builder/core';
import { type ReactFlowState, useStore } from '@xyflow/react';
import { CircleAlert, TriangleAlert } from 'lucide-react';

import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';

import { describeNode, labelNamesKind } from '../lib/describe-node';
import { type NodeProblems, summarizeNodeProblems } from '../lib/node-problems';
import { nodeDescriptionId } from '../model/flow-node';
import { NodeKindIcon } from './NodeKindIcon';
import { PortHandle, type PortProblem } from './PortHandle';

export interface NodeCardProps {
  node: PipelineNode;
  selected?: boolean;
  /** Validation issues of the node (`ValidationReport.byNode`). */
  issues?: readonly ValidationIssue[];
}

/**
 * Card of a node on the canvas: kind icon, label, a summary of its settings and its ports. A node
 * with problems gets an error or warning border, a badge with their count and a description that
 * lists them; ports that edges still use but the node lost stay as placeholders.
 */
export function NodeCard({ node, selected = false, issues = EMPTY_ISSUES }: NodeCardProps) {
  const { inputs, outputs } = getNodePorts(node);
  const { title } = NODE_DEFINITIONS[node.kind];
  const problems = summarizeNodeProblems(node.id, issues);

  return (
    <div
      className={cn(
        'w-60 rounded-lg border border-border bg-surface text-fg shadow-elevated',
        // React Flow focuses the node wrapper; draw the ring on the card so it follows the corners.
        'in-focus-visible:outline-2 in-focus-visible:outline-offset-2 in-focus-visible:outline-focus',
        selected && 'border-accent ring-1 ring-accent',
        problems.severity === 'error' && 'border-danger',
        problems.severity === 'warning' && 'border-warning',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <NodeKindIcon kind={node.kind} className="size-4 shrink-0 text-fg-muted" />
        <span className="truncate text-sm font-semibold">{node.label}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {!labelNamesKind(node.label, title) && (
            <span className="text-xs text-fg-muted">{title}</span>
          )}
          <ProblemsBadge problems={problems} />
        </span>
      </div>
      <p className="truncate border-b border-border px-3 py-1.5 text-xs text-fg-muted">
        {describeNode(node)}
      </p>
      <div className="py-1.5 text-xs">
        {inputs.map((port) => (
          <PortRow
            key={`input-${port.id}`}
            port={port}
            direction="input"
            problem={problems.unconnectedInputs.has(port.id) ? 'unconnected' : undefined}
          />
        ))}
        {problems.removedInputs.map((id) => (
          <PortRow key={`input-${id}`} port={removedPort(id)} direction="input" problem="removed" />
        ))}
        {outputs.map((port) => (
          <PortRow key={`output-${port.id}`} port={port} direction="output" />
        ))}
        {problems.removedOutputs.map((id) => (
          <PortRow
            key={`output-${id}`}
            port={removedPort(id)}
            direction="output"
            problem="removed"
          />
        ))}
      </div>
      {problems.count > 0 && <NodeDescription nodeId={node.id} problems={problems} />}
    </div>
  );
}

function ProblemsBadge({ problems }: { problems: NodeProblems }) {
  if (problems.severity === null) return null;
  const isError = problems.severity === 'error';
  // The node's description lists the problems, so the badge is for sighted users only.
  return (
    <Badge tone={isError ? 'danger' : 'warning'} aria-hidden>
      {isError ? <CircleAlert /> : <TriangleAlert />}
      {problems.count}
    </Badge>
  );
}

interface PortRowProps {
  port: PortDefinition;
  direction: 'input' | 'output';
  problem?: PortProblem | undefined;
}

function PortRow({ port, direction, problem }: PortRowProps) {
  const handle = <PortHandle port={port} direction={direction} problem={problem} />;
  const type =
    problem === 'removed' ? (
      <span className="text-danger">removed</span>
    ) : (
      <span className="text-fg-muted">{port.type}</span>
    );
  return direction === 'input' ? (
    <div className="relative flex items-center gap-1.5 px-4 py-1">
      {handle}
      <span className="truncate">{port.label}</span>
      {type}
    </div>
  ) : (
    <div className="relative flex items-center justify-end gap-1.5 px-4 py-1">
      {type}
      <span className="truncate">{port.label}</span>
      {handle}
    </div>
  );
}

/** A port the node no longer has, shown so the edges that use it stay drawn. */
function removedPort(id: string): PortDefinition {
  return { id, label: id, type: 'any', required: false };
}

/**
 * The hint React Flow describes nodes with while keyboard access is on, which the canvas never
 * turns off. The config key reads inverted: React Flow shows its `keyboardDisabled` text then (the
 * one that mentions the arrow keys).
 */
function selectKeyboardHint(state: ReactFlowState): string {
  return state.ariaLabelConfig['node.a11yDescription.keyboardDisabled'];
}

/**
 * Accessible description of a node with problems. It replaces React Flow's keyboard hint on the
 * node, so it repeats that hint after the problems.
 */
function NodeDescription({ nodeId, problems }: { nodeId: string; problems: NodeProblems }) {
  const keyboardHint = useStore(selectKeyboardHint);
  return (
    <p id={nodeDescriptionId(nodeId)} className="sr-only">
      {`${problems.summary} ${keyboardHint}`}
    </p>
  );
}
