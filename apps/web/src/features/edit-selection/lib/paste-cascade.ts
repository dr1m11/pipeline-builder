import type { Position } from '@pipeline-builder/core';

/** How far copies move from their originals, right and down, and each repeated paste further. */
export const COPY_OFFSET = 32;

/** The clipboard text pasted last, and how many times in a row. */
export interface PasteCascade {
  readonly text: string | null;
  readonly pastes: number;
}

/** Before anything is copied or pasted. */
export const NO_PASTES: PasteCascade = { text: null, pastes: 0 };

/** Starts the cascade again for text just copied (or cut): its first paste moves one step. */
export function startCascade(text: string): PasteCascade {
  return { text, pastes: 0 };
}

/**
 * Where a paste of `text` goes, as an offset from the copied positions, and the cascade after it.
 * Each paste of the same text in a row moves one step further, so copies do not pile up on one
 * spot; other text, such as a copy from another tab, starts one step away.
 */
export function nextPaste(
  cascade: PasteCascade,
  text: string,
): { offset: Position; cascade: PasteCascade } {
  const pastes = (cascade.text === text ? cascade.pastes : 0) + 1;
  const distance = pastes * COPY_OFFSET;
  return { offset: { x: distance, y: distance }, cascade: { text, pastes } };
}
