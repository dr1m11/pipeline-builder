import { describe, expect, it } from 'vitest';

import { findCycles, type Link, nodesReaching } from './graph';

/** Links along `ids`: a → b → c. */
function chain(ids: readonly string[]): Link[] {
  return ids.slice(1).map((target, index) => ({ source: ids[index] ?? '', target }));
}

const LARGE = Array.from({ length: 10_000 }, (_, index) => `n${String(index)}`);

describe('findCycles', () => {
  it('finds nothing in a graph without cycles', () => {
    const links = [...chain(['a', 'b', 'c']), { source: 'a', target: 'c' }];
    expect(findCycles(['a', 'b', 'c'], links)).toEqual([]);
  });

  it('finds nodes that reach each other, listed in node order', () => {
    const links = [...chain(['c', 'a', 'b']), { source: 'b', target: 'c' }];
    expect(findCycles(['a', 'b', 'c', 'd'], links)).toEqual([['a', 'b', 'c']]);
  });

  it('counts a node linked to itself as a cycle', () => {
    expect(findCycles(['a', 'b'], [{ source: 'b', target: 'b' }])).toEqual([['b']]);
  });

  it('reports separate cycles by their first node', () => {
    const links = [
      ...chain(['d', 'c', 'd']),
      ...chain(['b', 'a', 'b']),
      { source: 'b', target: 'c' },
    ];
    expect(findCycles(['a', 'b', 'c', 'd'], links)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('walks a long chain and a long ring without overflowing the stack', () => {
    expect(findCycles(LARGE, chain(LARGE))).toEqual([]);
    const ring = [...chain(LARGE), { source: LARGE.at(-1) ?? '', target: 'n0' }];
    expect(findCycles(LARGE, ring)).toEqual([LARGE]);
  });
});

describe('nodesReaching', () => {
  it('collects the targets and every node with a path to one of them', () => {
    const links = [...chain(['a', 'b', 'out']), ...chain(['c', 'b']), ...chain(['out', 'd'])];
    expect([...nodesReaching(['out'], links)].sort()).toEqual(['a', 'b', 'c', 'out']);
  });

  it('follows a long chain', () => {
    expect(nodesReaching([LARGE.at(-1) ?? ''], chain(LARGE)).size).toBe(LARGE.length);
  });
});
