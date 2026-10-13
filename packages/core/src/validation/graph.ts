/** A directed edge between two nodes, by node id. */
export interface Link {
  readonly source: string;
  readonly target: string;
}

interface Vertex {
  readonly id: string;
  readonly index: number;
  low: number;
  onStack: boolean;
  readonly successors: readonly string[];
  /** Position of the next successor to visit. */
  next: number;
}

/**
 * Strongly connected components that form cycles: two or more nodes reaching each other, or one
 * node with an edge to itself. Each cycle lists its nodes in the order of `nodeIds`; cycles are
 * ordered by their first node.
 *
 * Tarjan's algorithm with an explicit stack instead of recursion, so a long chain of nodes cannot
 * overflow the call stack.
 */
export function findCycles(
  nodeIds: readonly string[],
  links: readonly Link[],
): readonly (readonly string[])[] {
  const successors = new Map<string, string[]>();
  const selfLoops = new Set<string>();
  for (const { source, target } of links) {
    const list = successors.get(source);
    if (list === undefined) successors.set(source, [target]);
    else list.push(target);
    if (source === target) selfLoops.add(source);
  }

  const vertices = new Map<string, Vertex>();
  const stack: Vertex[] = [];
  const components: string[][] = [];

  const enter = (id: string): Vertex => {
    const vertex: Vertex = {
      id,
      index: vertices.size,
      low: vertices.size,
      onStack: true,
      successors: successors.get(id) ?? [],
      next: 0,
    };
    vertices.set(id, vertex);
    stack.push(vertex);
    return vertex;
  };

  for (const root of nodeIds) {
    if (vertices.has(root)) continue;
    const path: Vertex[] = [enter(root)];
    for (let vertex = path.at(-1); vertex !== undefined; vertex = path.at(-1)) {
      const successorId = vertex.successors[vertex.next];
      if (successorId !== undefined) {
        vertex.next += 1;
        const successor = vertices.get(successorId);
        if (successor === undefined) path.push(enter(successorId));
        else if (successor.onStack) vertex.low = Math.min(vertex.low, successor.index);
        continue;
      }
      path.pop();
      const parent = path.at(-1);
      if (parent !== undefined) parent.low = Math.min(parent.low, vertex.low);
      if (vertex.low === vertex.index) {
        const members = stack.splice(stack.lastIndexOf(vertex));
        for (const member of members) member.onStack = false;
        components.push(members.map((member) => member.id));
      }
    }
  }

  // Report cycles in pipeline order: by their first node, each listing its nodes in that order.
  const cycleOf = new Map<string, ReadonlySet<string>>();
  for (const ids of components) {
    if (ids.length === 1 && !ids.some((id) => selfLoops.has(id))) continue;
    const members = new Set(ids);
    for (const id of ids) cycleOf.set(id, members);
  }
  const cycles: string[][] = [];
  const reported = new Set<ReadonlySet<string>>();
  for (const id of nodeIds) {
    const members = cycleOf.get(id);
    if (members === undefined || reported.has(members)) continue;
    reported.add(members);
    cycles.push(nodeIds.filter((nodeId) => members.has(nodeId)));
  }
  return cycles;
}

/** Nodes from which one of `targets` can be reached by following links (the targets included). */
export function nodesReaching(
  targets: readonly string[],
  links: readonly Link[],
): ReadonlySet<string> {
  const predecessors = new Map<string, string[]>();
  for (const { source, target } of links) {
    const list = predecessors.get(target);
    if (list === undefined) predecessors.set(target, [source]);
    else list.push(source);
  }
  const reached = new Set(targets);
  const queue = [...targets];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const predecessor of predecessors.get(id) ?? []) {
      if (reached.has(predecessor)) continue;
      reached.add(predecessor);
      queue.push(predecessor);
    }
  }
  return reached;
}
