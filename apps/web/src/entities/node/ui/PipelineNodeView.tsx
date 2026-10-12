import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';

import type { PipelineFlowNode } from '../model/flow-node';
import { NodeCard } from './NodeCard';

/** React Flow node component for every pipeline node kind. */
export const PipelineNodeView = memo(function PipelineNodeView({
  data,
  selected,
}: NodeProps<PipelineFlowNode>) {
  return <NodeCard node={data.node} selected={selected} />;
});
