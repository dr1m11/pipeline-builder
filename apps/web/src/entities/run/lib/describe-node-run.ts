import type { JsonValue, NodeRunStatus, SkipReason } from '@pipeline-builder/core';

import type { NodeRunState } from '../model/run-state';

/** A node's run status, as its badge names it. */
export const NODE_RUN_STATUS_LABELS = {
  idle: 'Not run',
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
} as const satisfies Record<NodeRunStatus, string>;

/** Why a node was skipped, as a clause: "Skipped: its branch was not taken". */
export const SKIP_REASON_TEXTS = {
  'branch-not-taken': 'its branch was not taken',
  'upstream-failed': 'a node it depends on failed',
} as const satisfies Record<SkipReason, string>;

/** The node a step-by-step run is paused before, as its badge names it. */
export const NEXT_NODE_LABEL = 'Next';

/**
 * What the run did to a node, in a sentence for its accessible description: "Run status: failed.
 * The API key was rejected.", "Run status: skipped, its branch was not taken." Empty for a node no
 * run has reported. A node a step-by-step run is `paused` before is the next one to run.
 */
export function describeNodeRun(
  { status, error, skipReason }: NodeRunState,
  { paused = false }: { readonly paused?: boolean } = {},
): string {
  if (status === 'idle') return '';
  if (paused) return 'Run status: next. The run is paused before this node.';
  const label = NODE_RUN_STATUS_LABELS[status].toLowerCase();
  if (status === 'error' && error !== undefined) {
    return `Run status: ${label}. ${asSentence(error.message)}`;
  }
  if (status === 'skipped' && skipReason !== undefined) {
    return `Run status: ${label}, ${SKIP_REASON_TEXTS[skipReason]}.`;
  }
  return `Run status: ${label}.`;
}

/** A value a node produced, as text: a string as it is, anything else as indented JSON. */
export function formatRunValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** `text` ending with a full stop, unless it ends with a punctuation mark already. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
