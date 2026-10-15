import { getNodePorts, type PipelineNode } from '@pipeline-builder/core';
import { useId } from 'react';

import { formatRunValue, SKIP_REASON_TEXTS } from '../lib/describe-node-run';
import type { NodeRunState } from '../model/run-state';
import { useNodeRun } from '../model/store-context';
import { RunStatusBadge } from './RunStatusBadge';

/** A value the node produced, under the name of its port. */
interface ShownValue {
  readonly label: string;
  readonly text: string;
}

/**
 * Everything the run did to `node`, for the inspector: its status, why it failed or was skipped,
 * and the full value of each output (text as written, other values as indented JSON), or the
 * response streamed so far. Nothing while no run has reported the node.
 */
export function NodeRunDetails({ node }: { node: PipelineNode }) {
  const run = useNodeRun(node.id);
  if (run.status === 'idle') return null;
  const values = shownValues(node, run);

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="flex items-center gap-2">
        <RunStatusBadge status={run.status} />
        {run.status === 'skipped' && run.skipReason !== undefined && (
          <span className="text-fg-muted">Because {SKIP_REASON_TEXTS[run.skipReason]}</span>
        )}
      </p>
      {run.error !== undefined && <p className="text-danger">{run.error.message}</p>}
      {values.map((value) => (
        <RunValue key={value.label} {...value} />
      ))}
    </div>
  );
}

/** A value as written, under the name of its port. */
function RunValue({ label, text }: ShownValue) {
  const captionId = useId();
  // Named by its caption explicitly: not every browser and screen reader does it for a figure.
  return (
    <figure aria-labelledby={captionId} className="flex flex-col gap-1">
      <figcaption id={captionId} className="text-xs font-medium text-fg-muted">
        {label}
      </figcaption>
      <pre className="rounded-md bg-surface-muted p-2 font-mono text-xs break-words whitespace-pre-wrap">
        {text}
      </pre>
    </figure>
  );
}

/**
 * The outputs of a node that has them, named after their ports; before that, the response an LLM
 * Call has streamed so far. An Output's `value` is not a port of its own: it is the result.
 */
function shownValues(node: PipelineNode, { text, outputs }: NodeRunState): ShownValue[] {
  const ports = getNodePorts(node).outputs;
  if (outputs !== undefined) {
    return Object.entries(outputs).map(([portId, value]) => ({
      label: ports.find((port) => port.id === portId)?.label ?? 'result',
      text: formatRunValue(value),
    }));
  }
  if (text === '') return [];
  const [streamed] = ports;
  return [{ label: `${streamed?.label ?? 'response'} (so far)`, text }];
}
