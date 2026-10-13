import { createNode, type Position } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { findFreePosition, viewportCenter } from './placement';

function nodeAt(position: Position) {
  const id = `${String(position.x)},${String(position.y)}`;
  return createNode('input', { id, label: 'Input', position });
}

const origin = { x: 0, y: 0 };

describe('viewportCenter', () => {
  it('finds the middle of the pane in flow coordinates', () => {
    expect(viewportCenter({ width: 800, height: 600, transform: [0, 0, 1] })).toEqual({
      x: 400,
      y: 300,
    });
    // The flow is panned 100px right and 50px up, and zoomed in 2×.
    expect(viewportCenter({ width: 800, height: 600, transform: [100, -50, 2] })).toEqual({
      x: 150,
      y: 175,
    });
  });
});

describe('findFreePosition', () => {
  it('keeps the wanted position when no card is in the way', () => {
    expect(findFreePosition([nodeAt({ x: 400, y: 0 })], new Map(), origin)).toEqual(origin);
  });

  it('lines new cards up to the right, then to the left, of a taken spot', () => {
    const taken = [nodeAt(origin)];
    expect(findFreePosition(taken, new Map(), origin)).toEqual({ x: 280, y: 0 });

    taken.push(nodeAt({ x: 280, y: 0 }));
    expect(findFreePosition(taken, new Map(), origin)).toEqual({ x: -280, y: 0 });
  });

  it('keeps clear of a card by its measured size', () => {
    const tall = nodeAt(origin);
    const measured = new Map([[tall.id, { width: 240, height: 500 }]]);

    // Right next to a 160px card is free, but this card reaches down to 500px.
    expect(findFreePosition([tall], measured, { x: 0, y: 400 })).toEqual({ x: 280, y: 400 });
  });
});
