import type { PipelineNode } from '@pipeline-builder/core';
import { useId } from 'react';

import { NodeRunDetails, useNodeRunStatus } from '@/entities/run';

import { useSelectedNode } from '../model/use-selected-node';

/**
 * What the current run did to the selected node: its status, its error, and the full value of its
 * outputs, as they stream. Shown only while one node is selected and the run has reported it.
 */
export function RunOutputSection() {
  const node = useSelectedNode();
  return node === undefined ? null : <NodeRunSection node={node} />;
}

function NodeRunSection({ node }: { node: PipelineNode }) {
  const headingId = useId();
  const status = useNodeRunStatus(node.id);
  if (status === 'idle') return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 border-t border-border p-3">
      <h2 id={headingId} className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Run output
      </h2>
      <NodeRunDetails node={node} />
    </section>
  );
}
