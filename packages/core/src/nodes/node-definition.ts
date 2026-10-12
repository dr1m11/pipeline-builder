import type { NodePorts } from '../ports';

/** Behaviour shared by every node of one kind. */
export interface NodeDefinition<Data> {
  /** Name shown in the palette; default node labels are numbered after it ("Prompt 2"). */
  readonly title: string;
  readonly description: string;
  /** Data of a newly created node. Returns a new object on every call. */
  readonly createData: () => Data;
  /**
   * Ports of a node with the given data; some kinds derive them from it (Prompt variables).
   * The result may be a new object on every call: memoize by node data where identity matters.
   */
  readonly getPorts: (data: Data) => NodePorts;
}
