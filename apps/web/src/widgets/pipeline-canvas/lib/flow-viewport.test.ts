import { describe, expect, it } from 'vitest';

import { isInsideRect, visibleFlowRect } from './flow-viewport';

describe('visibleFlowRect', () => {
  it('is as large as the pane at full size', () => {
    // Panned so that the flow's origin is 40px right of the left side and 20px down.
    expect(visibleFlowRect(800, 600, [40, 20, 1])).toEqual({
      x: -40,
      y: -20,
      width: 800,
      height: 600,
    });
  });

  it('follows the pan and the zoom', () => {
    // Panned so that flow point (100, 50) is at the top left, zoomed in twice.
    expect(visibleFlowRect(800, 600, [-200, -100, 2])).toEqual({
      x: 100,
      y: 50,
      width: 400,
      height: 300,
    });
  });
});

describe('isInsideRect', () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };

  it('takes a rect that lies wholly inside', () => {
    expect(isInsideRect({ x: 10, y: 10, width: 240, height: 120 }, area)).toBe(true);
    expect(isInsideRect(area, area)).toBe(true);
  });

  it('refuses a rect that sticks out on any side, or lies outside', () => {
    for (const rect of [
      { x: -1, y: 10, width: 240, height: 120 },
      { x: 10, y: -1, width: 240, height: 120 },
      { x: 600, y: 10, width: 240, height: 120 },
      { x: 10, y: 500, width: 240, height: 120 },
      { x: 2000, y: 2000, width: 240, height: 120 },
    ]) {
      expect(isInsideRect(rect, area)).toBe(false);
    }
  });

  it('keeps a margin from the sides', () => {
    const rect = { x: 10, y: 10, width: 240, height: 120 };

    expect(isInsideRect(rect, area, 10)).toBe(true);
    expect(isInsideRect(rect, area, 11)).toBe(false);
  });
});
