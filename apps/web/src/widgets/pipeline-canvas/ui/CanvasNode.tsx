import type { NodeKind } from '@pipeline-builder/core';
import type { NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';

import { type NodeRunSlots, type PipelineFlowNode, PipelineNodeView } from '@/entities/node';
import { NodeRunBadge, NodeRunDescription, NodeRunPreview, useRunStore } from '@/entities/run';

/** The output a node kind's card shows during a run, and what to call it ("Model response"). */
const PREVIEWS: Partial<Record<NodeKind, { readonly port: string; readonly name: string }>> = {
  'llm-call': { port: 'response', name: 'response' },
  output: { port: 'value', name: 'result' },
};

/**
 * A pipeline node on the canvas, with what the current run did to it. The run's components read
 * the run store by node id themselves, so a streamed token re-renders the text of its node only,
 * and the node objects React Flow gets stay free of run state (see docs/adr/0006).
 */
export const CanvasNode = memo(function CanvasNode(props: NodeProps<PipelineFlowNode>) {
  const { id } = props;
  const { kind, label } = props.data.node;
  const skipped = useRunStore((state) => state.nodes.get(id)?.status === 'skipped');

  const run = useMemo((): NodeRunSlots => {
    const preview = PREVIEWS[kind];
    return {
      status: <NodeRunBadge nodeId={id} />,
      preview: (
        <NodeRunPreview
          nodeId={id}
          port={preview?.port}
          label={`${label} ${preview?.name ?? 'result'}`}
        />
      ),
      description: <NodeRunDescription nodeId={id} />,
      dimmed: skipped,
    };
  }, [id, kind, label, skipped]);

  return <PipelineNodeView {...props} run={run} />;
});
