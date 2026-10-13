import type { IssueSeverity, NodePorts, ValidationIssue } from '@pipeline-builder/core';

/** What a node's validation issues mean for its card. */
export interface NodeProblems {
  /** The worst severity among the issues, or null for a node without problems. */
  readonly severity: IssueSeverity | null;
  readonly count: number;
  /** "2 problems: …", or an empty string for a node without problems. */
  readonly summary: string;
  /** Required inputs without an edge. */
  readonly unconnectedInputs: ReadonlySet<string>;
  /** Ports the node no longer has but edges still use, kept so those edges stay drawn. */
  readonly removedInputs: readonly string[];
  readonly removedOutputs: readonly string[];
}

const NO_PROBLEMS: NodeProblems = {
  severity: null,
  count: 0,
  summary: '',
  unconnectedInputs: new Set(),
  removedInputs: [],
  removedOutputs: [],
};

/** Summarizes the issues of node `nodeId` (`ValidationReport.byNode`) for its card. */
export function summarizeNodeProblems(
  nodeId: string,
  issues: readonly ValidationIssue[],
): NodeProblems {
  if (issues.length === 0) return NO_PROBLEMS;

  const unconnectedInputs = new Set<string>();
  const removedInputs = new Set<string>();
  const removedOutputs = new Set<string>();
  for (const issue of issues) {
    if (issue.code === 'missing-input') unconnectedInputs.add(issue.portId);
    if (issue.code === 'dangling-edge' && issue.missing === 'port' && issue.nodeId === nodeId) {
      (issue.end === 'target' ? removedInputs : removedOutputs).add(issue.portId);
    }
  }

  const count = issues.length;
  const messages = issues.map((issue) => `${issue.message}.`).join(' ');
  return {
    severity: issues.some((issue) => issue.severity === 'error') ? 'error' : 'warning',
    count,
    summary: `${String(count)} ${count === 1 ? 'problem' : 'problems'}: ${messages}`,
    unconnectedInputs,
    removedInputs: [...removedInputs],
    removedOutputs: [...removedOutputs],
  };
}

/**
 * A key for the handles a node's card shows, in order: inputs, removed inputs, outputs, removed
 * outputs. It changes exactly when React Flow has to measure the node's handles again.
 */
export function handlesKey(ports: NodePorts, problems: NodeProblems): string {
  const inputs = [...ports.inputs.map((port) => port.id), ...problems.removedInputs];
  const outputs = [...ports.outputs.map((port) => port.id), ...problems.removedOutputs];
  return JSON.stringify([inputs, outputs]);
}
