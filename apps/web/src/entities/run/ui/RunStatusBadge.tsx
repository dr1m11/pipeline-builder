import type { NodeRunStatus } from '@pipeline-builder/core';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';

import { Badge, type BadgeProps } from '@/shared/ui/badge';

import { NODE_RUN_STATUS_LABELS } from '../lib/describe-node-run';
import { useNodeRunStatus } from '../model/store-context';

/** A status a run reports; `idle` is the absence of one. */
export type ReportedRunStatus = Exclude<NodeRunStatus, 'idle'>;

const STATUS_ICONS = {
  queued: Clock,
  running: LoaderCircle,
  done: CircleCheck,
  error: CircleX,
  cancelled: Ban,
  skipped: CircleDashed,
} as const satisfies Record<ReportedRunStatus, LucideIcon>;

const STATUS_TONES = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  error: 'danger',
  cancelled: 'neutral',
  skipped: 'neutral',
} as const satisfies Record<ReportedRunStatus, NonNullable<BadgeProps['tone']>>;

export interface RunStatusBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: ReportedRunStatus;
}

/**
 * A node's run status as an icon and a word, never colour alone: Queued, Running (with a spinner
 * that stops when the user prefers reduced motion), Done, Failed, Cancelled or Skipped.
 */
export function RunStatusBadge({ status, ...props }: RunStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge tone={STATUS_TONES[status]} {...props}>
      <Icon aria-hidden className={status === 'running' ? 'motion-safe:animate-spin' : undefined} />
      {NODE_RUN_STATUS_LABELS[status]}
    </Badge>
  );
}

export interface NodeRunBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  nodeId: string;
}

/**
 * The run status of the node `nodeId` from the surrounding run store, or nothing while no run has
 * reported the node. It re-renders when the status changes, not while the node streams.
 */
export function NodeRunBadge({ nodeId, ...props }: NodeRunBadgeProps) {
  const status = useNodeRunStatus(nodeId);
  return status === 'idle' ? null : <RunStatusBadge status={status} {...props} />;
}
