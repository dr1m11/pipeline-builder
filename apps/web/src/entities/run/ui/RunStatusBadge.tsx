import type { NodeRunStatus } from '@pipeline-builder/core';
import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  LoaderCircle,
  type LucideIcon,
  StepForward,
} from 'lucide-react';

import { Badge, type BadgeProps } from '@/shared/ui/badge';

import { NEXT_NODE_LABEL, NODE_RUN_STATUS_LABELS } from '../lib/describe-node-run';
import { useIsPausedBefore, useNodeRunStatus } from '../model/store-context';

/** A status a run reports; `idle` is the absence of one. */
export type ReportedRunStatus = Exclude<NodeRunStatus, 'idle'>;

/** What a badge shows: a reported status, or `next` for the node a step-by-step run waits before. */
export type ShownRunStatus = ReportedRunStatus | 'next';

const STATUS_LABELS = {
  ...NODE_RUN_STATUS_LABELS,
  next: NEXT_NODE_LABEL,
} as const satisfies Record<ShownRunStatus, string>;

const STATUS_ICONS = {
  queued: Clock,
  running: LoaderCircle,
  done: CircleCheck,
  error: CircleX,
  cancelled: Ban,
  skipped: CircleDashed,
  next: StepForward,
} as const satisfies Record<ShownRunStatus, LucideIcon>;

const STATUS_TONES = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  error: 'danger',
  cancelled: 'neutral',
  skipped: 'neutral',
  next: 'info',
} as const satisfies Record<ShownRunStatus, NonNullable<BadgeProps['tone']>>;

export interface RunStatusBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  status: ShownRunStatus;
}

/**
 * A node's run status as an icon and a word, never colour alone: Queued, Running (with a spinner
 * that stops when the user prefers reduced motion), Done, Failed, Cancelled or Skipped; or Next,
 * for the node a step-by-step run is paused before.
 */
export function RunStatusBadge({ status, ...props }: RunStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];
  return (
    <Badge tone={STATUS_TONES[status]} {...props}>
      <Icon aria-hidden className={status === 'running' ? 'motion-safe:animate-spin' : undefined} />
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export interface NodeRunBadgeProps extends Omit<BadgeProps, 'tone' | 'children'> {
  nodeId: string;
}

/**
 * The run status of the node `nodeId` from the surrounding run store (Next while a step-by-step run
 * is paused before it), or nothing while no run has reported the node. It re-renders when the
 * status changes, not while the node streams.
 */
export function NodeRunBadge({ nodeId, ...props }: NodeRunBadgeProps) {
  const status = useNodeRunStatus(nodeId);
  const paused = useIsPausedBefore(nodeId);
  if (status === 'idle') return null;
  return <RunStatusBadge status={paused ? 'next' : status} {...props} />;
}
