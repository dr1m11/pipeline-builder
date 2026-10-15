import type { Rect, Transform } from '@xyflow/react';

/**
 * The part of the flow a pane of `width` × `height` pixels shows at `transform` (React Flow's
 * `[x, y, zoom]`), in flow coordinates.
 */
export function visibleFlowRect(width: number, height: number, [x, y, zoom]: Transform): Rect {
  return { x: -x / zoom, y: -y / zoom, width: width / zoom, height: height / zoom };
}

/** Whether `rect` lies wholly inside `area`, at least `margin` from each of its sides. */
export function isInsideRect(rect: Rect, area: Rect, margin = 0): boolean {
  return (
    rect.x >= area.x + margin &&
    rect.y >= area.y + margin &&
    rect.x + rect.width <= area.x + area.width - margin &&
    rect.y + rect.height <= area.y + area.height - margin
  );
}
