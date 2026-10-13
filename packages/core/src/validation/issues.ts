import type { PortType } from '../ports';

/** How bad a problem is: errors block a run, warnings do not. */
export type IssueSeverity = 'error' | 'warning';

interface IssueBase {
  /** Stable for the same problem across validations, unique within a report. */
  readonly id: string;
  /** English description; it never names the node, so the UI can put the node label in front. */
  readonly message: string;
}

/** Nodes whose edges lead back to themselves; the pipeline could never finish. */
export interface CycleIssue extends IssueBase {
  readonly code: 'cycle';
  readonly severity: 'error';
  /** Nodes of the cycle, in pipeline order. */
  readonly nodeIds: readonly string[];
  /** Edges between nodes of the cycle, in pipeline order. */
  readonly edgeIds: readonly string[];
}

/** An edge whose node or port no longer exists, e.g. after a `{{variable}}` left a template. */
export interface DanglingEdgeIssue extends IssueBase {
  readonly code: 'dangling-edge';
  readonly severity: 'error';
  readonly edgeId: string;
  /** The broken end of the edge. */
  readonly end: 'source' | 'target';
  /** Node at the broken end (missing itself when `missing` is `'node'`). */
  readonly nodeId: string;
  readonly portId: string;
  readonly missing: 'node' | 'port';
}

/** An edge between ports whose types no longer match (a node's settings changed its ports). */
export interface IncompatibleEdgeIssue extends IssueBase {
  readonly code: 'incompatible-edge';
  readonly severity: 'error';
  readonly edgeId: string;
  readonly sourceType: PortType;
  readonly targetType: PortType;
}

/** A required input with no edge. */
export interface MissingInputIssue extends IssueBase {
  readonly code: 'missing-input';
  readonly severity: 'error';
  readonly nodeId: string;
  readonly portId: string;
}

/** A data field that breaks the rules of its node kind. */
export interface InvalidFieldIssue extends IssueBase {
  readonly code: 'invalid-field';
  readonly severity: 'error';
  readonly nodeId: string;
  /** Key of the field in the node data. */
  readonly field: string;
}

/** A node whose result reaches no Output, so it would be discarded. */
export interface UnreachableIssue extends IssueBase {
  readonly code: 'unreachable';
  readonly severity: 'warning';
  readonly nodeId: string;
}

/** A pipeline with nodes but no Output, so a run would show nothing. */
export interface NoOutputIssue extends IssueBase {
  readonly code: 'no-output';
  readonly severity: 'warning';
}

/** A problem found by `validatePipeline`; narrow it by `code`. */
export type ValidationIssue =
  | CycleIssue
  | DanglingEdgeIssue
  | IncompatibleEdgeIssue
  | MissingInputIssue
  | InvalidFieldIssue
  | UnreachableIssue
  | NoOutputIssue;

/** Everything `validatePipeline` found in a pipeline. */
export interface ValidationReport {
  /**
   * Errors, then warnings. Within each: pipeline-wide problems, cycles, node problems in node
   * order, then edge problems in edge order.
   */
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
  /** Whether a run must be blocked. */
  readonly hasErrors: boolean;
  /**
   * Problems shown on each node: its own, the cycles it belongs to and edges to a port of it that
   * no longer exists. Nodes without problems are absent; use `EMPTY_ISSUES` as the fallback.
   */
  readonly byNode: ReadonlyMap<string, readonly ValidationIssue[]>;
  /** Problems shown on each edge: cycles, broken ends and type mismatches. */
  readonly byEdge: ReadonlyMap<string, readonly ValidationIssue[]>;
}

/** The issues of an element without problems; shared, so lookups need not allocate. */
export const EMPTY_ISSUES: readonly ValidationIssue[] = Object.freeze([]);
