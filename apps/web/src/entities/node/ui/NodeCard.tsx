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
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';

import { describeNode, labelNamesKind } from '../lib/describe-node';
import { type NodeProblems, summarizeNodeProblems } from '../lib/node-problems';
import { nodeDescriptionId } from '../model/flow-node';
import { NodeKindIcon } from './NodeKindIcon';
import { PortHandle, type PortProblem } from './PortHandle';

/**
 * What a run shows on a node's card. The card only places it: the canvas composes it from the run's
 * own components, which read the run by node id, so a token re-renders them and not the card.
 */
export interface NodeRunSlots {
  /**
   * The run status, at the end of the summary's row. It is hidden from assistive technology:
   * `description` says it.
   */
  readonly status?: ReactNode;
  /** What the node produced, or why it failed, below the ports. */
  readonly preview?: ReactNode;
  /** Text read in the node's description, after its problems. */
  readonly description?: ReactNode;
  /** Draws the card dimmed, as for a node the run skipped. */
  readonly dimmed?: boolean;
}

export interface NodeCardProps {
  node: PipelineNode;
  selected?: boolean;
  /** Validation issues of the node (`ValidationReport.byNode`). */
  issues?: readonly ValidationIssue[];
  /** What the current run shows on the card, if anything. */
  run?: NodeRunSlots | undefined;
}

/**
 * Card of a node on the canvas: kind icon, label, a summary of its settings and its ports. A node
 * with problems gets an error or warning border, a badge with their count and a description that
 * lists them; ports that edges still use but the node lost stay as placeholders. A run adds its
 * status, the node's result and a line of description (`NodeRunSlots`).
 */
export function NodeCard({
  node,
  selected = false,
  issues = EMPTY_ISSUES,
  run = {},
}: NodeCardProps) {
  const { inputs, outputs } = getNodePorts(node);
  const { title } = NODE_DEFINITIONS[node.kind];
  const problems = summarizeNodeProblems(node.id, issues);

  return (
    <div
      className={cn(
        'w-60 rounded-lg border border-border bg-surface text-fg shadow-elevated',
        // React Flow focuses the node wrapper; draw the ring on the card so it follows the corners.
        'in-focus-visible:outline-2 in-focus-visible:outline-offset-2 in-focus-visible:outline-focus',
        // Dimmed without fading the text, which must keep its contrast: a flat card, dashed.
        run.dimmed === true && 'border-dashed bg-surface-muted shadow-none',
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
      {/* The run status shares the summary's row rather than the header, where the label needs the
          room. The node's description says it, so it is for sighted users only; a slot that shows
          nothing takes no room. */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-xs text-fg-muted">{describeNode(node)}</p>
        {run.status !== undefined && (
          <span aria-hidden className="flex shrink-0 empty:hidden">
            {run.status}
          </span>
        )}
      </div>
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
      {run.preview}
      <NodeDescription nodeId={node.id} problems={problems} run={run.description} />
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

interface NodeDescriptionProps {
  nodeId: string;
  problems: NodeProblems;
  run: ReactNode;
}

/**
 * Accessible description of a node: its problems, what the run did to it, and React Flow's keyboard
 * hint, which it replaces on the node.
 */
function NodeDescription({ nodeId, problems, run }: NodeDescriptionProps) {
  const keyboardHint = useStore(selectKeyboardHint);
  // The spaces separate the parts; an empty part leaves only extra whitespace, which is not read.
  return (
    <p id={nodeDescriptionId(nodeId)} className="sr-only">
      {problems.summary} {run} {keyboardHint}
    </p>
  );
}
