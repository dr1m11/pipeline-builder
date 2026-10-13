import type { PipelineNode, Position } from '@pipeline-builder/core';

import type { Size } from '@/entities/pipeline';

/** The visible part of the canvas: React Flow's pane size and its `[x, y, zoom]` transform. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly transform: readonly [number, number, number];
}

/** The flow position in the middle of the visible canvas. */
export function viewportCenter({ width, height, transform: [x, y, zoom] }: Viewport): Position {
  return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
}

/** Size of a node card before the canvas has measured it: cards are 240px wide. */
export const CARD_SIZE: Size = { width: 240, height: 160 };

// Space kept between a new card and the cards around it.
const GAP = 40;
// Cells around the wanted spot, nearest first; within a ring, the same row first and the right
// side before the left, so cards added one after another line up like a pipeline.
const RINGS = 3;
const CELLS = Array.from({ length: (2 * RINGS + 1) ** 2 }, (_, index) => ({
  column: (index % (2 * RINGS + 1)) - RINGS,
  row: Math.floor(index / (2 * RINGS + 1)) - RINGS,
})).sort(
  (a, b) =>
    ring(a) - ring(b) || Math.abs(a.row) - Math.abs(b.row) || b.column - a.column || a.row - b.row,
);

function ring({ column, row }: { column: number; row: number }): number {
  return Math.max(Math.abs(column), Math.abs(row));
}

/**
 * Where to put a new card near `wanted` (its top left corner) so that it covers no other card:
 * `wanted` itself or the nearest free cell of a grid around it. Cards the canvas has not measured
 * yet count as `CARD_SIZE`. Falls back to `wanted` when the cells nearby are all taken.
 */
export function findFreePosition(
  nodes: readonly PipelineNode[],
  measured: ReadonlyMap<string, Size>,
  wanted: Position,
): Position {
  const cards = nodes.map((node) => ({
    ...node.position,
    ...(measured.get(node.id) ?? CARD_SIZE),
  }));
  for (const { column, row } of CELLS) {
    const position = {
      x: wanted.x + column * (CARD_SIZE.width + GAP),
      y: wanted.y + row * (CARD_SIZE.height + GAP),
    };
    if (!cards.some((card) => overlaps(card, position))) return position;
  }
  return wanted;
}

/** Whether a new card at `position`, with a gap around it, would cover `card`. */
function overlaps(card: Position & Size, position: Position): boolean {
  return (
    card.x < position.x + CARD_SIZE.width + GAP &&
    position.x - GAP < card.x + card.width &&
    card.y < position.y + CARD_SIZE.height + GAP &&
    position.y - GAP < card.y + card.height
  );
}
