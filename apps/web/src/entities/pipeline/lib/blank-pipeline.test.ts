import { addNode, createEmptyPipeline } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { createBlankPipeline, isBlankPipeline } from './blank-pipeline';

describe('createBlankPipeline', () => {
  it('makes an empty untitled pipeline with the given id', () => {
    expect(createBlankPipeline('fresh')).toEqual(
      createEmptyPipeline({ id: 'fresh', name: 'Untitled pipeline' }),
    );
  });
});

describe('isBlankPipeline', () => {
  it('accepts a blank pipeline whatever its id', () => {
    expect(isBlankPipeline(createBlankPipeline('draft'))).toBe(true);
    expect(isBlankPipeline(createBlankPipeline('other'))).toBe(true);
  });

  it('rejects a pipeline with nodes or another name', () => {
    const withNode = addNode(createBlankPipeline('draft'), {
      kind: 'input',
      id: 'input',
      position: { x: 0, y: 0 },
    }).pipeline;
    expect(isBlankPipeline(withNode)).toBe(false);
    expect(isBlankPipeline(createEmptyPipeline({ id: 'draft', name: 'Ask a question' }))).toBe(
      false,
    );
  });
});
