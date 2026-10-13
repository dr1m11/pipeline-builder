import { getNodePorts } from '../nodes/registry';
import type { Pipeline, PipelineEdge } from '../pipeline';
import { arePortTypesCompatible, type NodePorts, type PortDefinition } from '../ports';
import { findCycles, nodesReaching } from './graph';
import type { ValidationIssue, ValidationReport } from './issues';
import { fieldProblems } from './node-data';

// Reports are read on every render of the canvas and the problems list; build each pipeline's once.
const reports = new WeakMap<Pipeline, ValidationReport>();

/**
 * Finds everything that would stop a pipeline from running (errors) or make part of it useless
 * (warnings). The same pipeline object always returns the same report; an empty pipeline has no
 * issues. See docs/adr/0008-graph-validation.md for the issue model.
 */
export function validatePipeline(pipeline: Pipeline): ValidationReport {
  let report = reports.get(pipeline);
  if (report === undefined) {
    report = buildReport(pipeline);
    reports.set(pipeline, report);
  }
  return report;
}

/** Where an issue is shown besides the problems list. */
interface Targets {
  readonly nodeIds?: readonly string[];
  readonly edgeIds?: readonly string[];
}

function buildReport({ nodes, edges }: Pipeline): ValidationReport {
  const issues: ValidationIssue[] = [];
  const byNode = new Map<string, ValidationIssue[]>();
  const byEdge = new Map<string, ValidationIssue[]>();
  // Issues are added in report order (errors first), so the lookups keep that order too.
  const add = (issue: ValidationIssue, { nodeIds = [], edgeIds = [] }: Targets) => {
    issues.push(issue);
    for (const id of nodeIds) appendTo(byNode, id, issue);
    for (const id of edgeIds) appendTo(byEdge, id, issue);
  };

  const nodePorts = nodes.map((node) => ({ node, ports: getNodePorts(node) }));
  const portsByNode = new Map(nodePorts.map(({ node, ports }) => [node.id, ports]));
  // Edges between existing nodes; a missing port still leaves the nodes linked.
  const links = edges.filter(
    (edge) => portsByNode.has(edge.source) && portsByNode.has(edge.target),
  );

  for (const nodeIds of findCycles(
    nodes.map((node) => node.id),
    links,
  )) {
    const members = new Set(nodeIds);
    const edgeIds = links
      .filter((edge) => members.has(edge.source) && members.has(edge.target))
      .map((edge) => edge.id);
    add(
      {
        code: 'cycle',
        severity: 'error',
        id: `cycle:${nodeIds.join(',')}`,
        message: 'Part of a cycle, so the pipeline could never finish',
        nodeIds,
        edgeIds,
      },
      { nodeIds, edgeIds },
    );
  }

  const connectedInputs = new Set(edges.map((edge) => portKey(edge.target, edge.targetPort)));
  for (const { node, ports } of nodePorts) {
    for (const port of ports.inputs) {
      if (!port.required || connectedInputs.has(portKey(node.id, port.id))) continue;
      add(
        {
          code: 'missing-input',
          severity: 'error',
          id: `missing-input:${node.id}:${port.id}`,
          message: `Input "${port.label}" is not connected`,
          nodeId: node.id,
          portId: port.id,
        },
        { nodeIds: [node.id] },
      );
    }
    for (const { field, message } of fieldProblems(node)) {
      add(
        {
          code: 'invalid-field',
          severity: 'error',
          id: `invalid-field:${node.id}:${field}`,
          message,
          nodeId: node.id,
          field,
        },
        { nodeIds: [node.id] },
      );
    }
  }

  for (const edge of edges) {
    const source = edgeEnd(edge, 'source', portsByNode.get(edge.source));
    const target = edgeEnd(edge, 'target', portsByNode.get(edge.target));
    for (const end of [source, target]) {
      if (end.issue === null) continue;
      add(end.issue, {
        nodeIds: end.issue.missing === 'port' ? [end.issue.nodeId] : [],
        edgeIds: [edge.id],
      });
    }
    if (source.port === null || target.port === null) continue;
    if (arePortTypesCompatible(source.port.type, target.port.type)) continue;
    add(
      {
        code: 'incompatible-edge',
        severity: 'error',
        id: `incompatible-edge:${edge.id}`,
        message: `Connects ${source.port.type} to ${target.port.type}; convert it with a Transform node`,
        edgeId: edge.id,
        sourceType: source.port.type,
        targetType: target.port.type,
      },
      { edgeIds: [edge.id] },
    );
  }

  const outputIds = nodes.filter((node) => node.kind === 'output').map((node) => node.id);
  if (nodes.length > 0 && outputIds.length === 0) {
    add(
      {
        code: 'no-output',
        severity: 'warning',
        id: 'no-output',
        message: 'The pipeline has no Output node, so a run would show nothing',
      },
      {},
    );
  } else if (outputIds.length > 0) {
    const useful = nodesReaching(outputIds, links);
    for (const node of nodes) {
      if (useful.has(node.id)) continue;
      add(
        {
          code: 'unreachable',
          severity: 'warning',
          id: `unreachable:${node.id}`,
          message: 'Its result does not reach any Output',
          nodeId: node.id,
        },
        { nodeIds: [node.id] },
      );
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    hasErrors: errorCount > 0,
    byNode,
    byEdge,
  };
}

interface EdgeEnd {
  /** The port at this end, or null when it or its node is gone. */
  readonly port: PortDefinition | null;
  readonly issue: Extract<ValidationIssue, { code: 'dangling-edge' }> | null;
}

/** Resolves one end of an edge against the current ports of its node. */
function edgeEnd(
  edge: PipelineEdge,
  end: 'source' | 'target',
  ports: NodePorts | undefined,
): EdgeEnd {
  const nodeId = end === 'source' ? edge.source : edge.target;
  const portId = end === 'source' ? edge.sourcePort : edge.targetPort;
  const port = (end === 'source' ? ports?.outputs : ports?.inputs)?.find((p) => p.id === portId);
  if (port !== undefined) return { port, issue: null };

  const missing = ports === undefined ? 'node' : 'port';
  return {
    port: null,
    issue: {
      code: 'dangling-edge',
      severity: 'error',
      id: `dangling-edge:${edge.id}:${end}`,
      message: danglingMessage(end, missing, portId),
      edgeId: edge.id,
      end,
      nodeId,
      portId,
      missing,
    },
  };
}

function danglingMessage(end: 'source' | 'target', missing: 'node' | 'port', portId: string) {
  if (missing === 'node') {
    return end === 'source'
      ? 'Comes from a node that no longer exists'
      : 'Goes to a node that no longer exists';
  }
  return `${end === 'source' ? 'Output' : 'Input'} "${portId}" no longer exists`;
}

function portKey(nodeId: string, portId: string): string {
  return `${nodeId}\u0000${portId}`;
}

function appendTo(map: Map<string, ValidationIssue[]>, key: string, issue: ValidationIssue): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [issue]);
  else list.push(issue);
}
