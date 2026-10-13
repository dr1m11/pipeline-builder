import {
  findNode,
  getNodePorts,
  type Pipeline,
  type PipelineEdge,
  type ValidationIssue,
} from '@pipeline-builder/core';

/** What gets focus once a problem is revealed. */
export type ProblemFocus =
  | { readonly kind: 'node'; readonly nodeId: string }
  | { readonly kind: 'edge'; readonly edgeId: string }
  | { readonly kind: 'field'; readonly nodeId: string; readonly field: string };

/** Where a problem is: what to select, what to bring into view and what to focus. */
export interface ProblemLocation {
  readonly nodeIds: readonly string[];
  readonly edgeIds: readonly string[];
  /** Nodes the view should fit; for an edge, the nodes it joins that still exist. */
  readonly visibleNodeIds: readonly string[];
  readonly focus: ProblemFocus;
}

/**
 * What a problem is about, as the problems list names it: a node label ("Prompt 1"), an edge
 * ("Input 1 value → Prompt 1 question"), a cycle ("Cycle: Prompt 1, LLM Call 1") or "Pipeline".
 * Ids stand in for nodes and ports the pipeline no longer has.
 */
export function problemName(issue: ValidationIssue, pipeline: Pipeline): string {
  switch (issue.code) {
    case 'no-output':
      return 'Pipeline';
    case 'cycle':
      return `Cycle: ${issue.nodeIds.map((id) => nodeName(pipeline, id)).join(', ')}`;
    case 'dangling-edge':
    case 'incompatible-edge': {
      const edge = findEdge(pipeline, issue.edgeId);
      return edge === undefined ? issue.edgeId : edgeName(pipeline, edge);
    }
    case 'missing-input':
    case 'invalid-field':
    case 'unreachable':
      return nodeName(pipeline, issue.nodeId);
  }
}

/** Where a problem is, or null for a problem of the whole pipeline, which has no place to show. */
export function problemLocation(
  issue: ValidationIssue,
  pipeline: Pipeline,
): ProblemLocation | null {
  switch (issue.code) {
    case 'no-output':
      return null;
    case 'cycle': {
      const [first] = issue.nodeIds;
      if (first === undefined) return null;
      return {
        nodeIds: issue.nodeIds,
        edgeIds: [],
        visibleNodeIds: issue.nodeIds,
        focus: { kind: 'node', nodeId: first },
      };
    }
    case 'dangling-edge':
    case 'incompatible-edge': {
      const edge = findEdge(pipeline, issue.edgeId);
      const ends = edge === undefined ? [] : [edge.source, edge.target];
      return {
        nodeIds: [],
        edgeIds: [issue.edgeId],
        visibleNodeIds: ends.filter((id) => findNode(pipeline, id) !== undefined),
        focus: { kind: 'edge', edgeId: issue.edgeId },
      };
    }
    case 'invalid-field':
      return {
        ...nodeLocation(issue.nodeId),
        focus: { kind: 'field', nodeId: issue.nodeId, field: issue.field },
      };
    case 'missing-input':
    case 'unreachable':
      return nodeLocation(issue.nodeId);
  }
}

function nodeLocation(nodeId: string): ProblemLocation {
  return {
    nodeIds: [nodeId],
    edgeIds: [],
    visibleNodeIds: [nodeId],
    focus: { kind: 'node', nodeId },
  };
}

function findEdge(pipeline: Pipeline, edgeId: string): PipelineEdge | undefined {
  return pipeline.edges.find((edge) => edge.id === edgeId);
}

function nodeName(pipeline: Pipeline, nodeId: string): string {
  return findNode(pipeline, nodeId)?.label ?? nodeId;
}

/** "Input 1 value → Prompt 1 question", like the edge's name on the canvas. */
function edgeName(pipeline: Pipeline, edge: PipelineEdge): string {
  const source = findNode(pipeline, edge.source);
  const target = findNode(pipeline, edge.target);
  const sourcePort = source && getNodePorts(source).outputs.find((p) => p.id === edge.sourcePort);
  const targetPort = target && getNodePorts(target).inputs.find((p) => p.id === edge.targetPort);
  const from = `${source?.label ?? edge.source} ${sourcePort?.label ?? edge.sourcePort}`;
  const to = `${target?.label ?? edge.target} ${targetPort?.label ?? edge.targetPort}`;
  return `${from} → ${to}`;
}
