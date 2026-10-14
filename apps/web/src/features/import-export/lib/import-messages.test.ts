import { createEmptyPipeline, type PipelineFileRepair } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import {
  describeImportFailure,
  describeImportSuccess,
  type ImportFailure,
  undoImportAltText,
} from './import-messages';

const pipeline = createEmptyPipeline({ id: 'imported', name: 'Ask a question' });

function repairs(count: number): PipelineFileRepair[] {
  return Array.from({ length: count }, (_, index) => ({
    edgeId: `edge-${String(index)}`,
    reason: index % 2 === 0 ? 'missing-node' : 'occupied-input',
  }));
}

describe('describeImportSuccess', () => {
  it('names the imported pipeline', () => {
    expect(describeImportSuccess({ pipeline, migratedFrom: null, repairs: [] })).toEqual({
      title: 'Imported “Ask a question”',
    });
  });

  it('says that a file of an older schema version was updated', () => {
    expect(describeImportSuccess({ pipeline, migratedFrom: 1, repairs: [] })).toEqual({
      title: 'Imported “Ask a question”',
      description: 'Updated from schema version 1.',
    });
  });

  it('counts the connections that were removed', () => {
    expect(describeImportSuccess({ pipeline, migratedFrom: null, repairs: repairs(1) })).toEqual({
      title: 'Imported “Ask a question”',
      description: '1 connection that pointed at a missing node or an occupied input was removed.',
    });
    expect(
      describeImportSuccess({ pipeline, migratedFrom: null, repairs: repairs(3) }).description,
    ).toBe('3 connections that pointed at missing nodes or occupied inputs were removed.');
  });

  it('says both when a file was updated and repaired', () => {
    expect(
      describeImportSuccess({ pipeline, migratedFrom: 2, repairs: repairs(2) }).description,
    ).toBe(
      'Updated from schema version 2. 2 connections that pointed at missing nodes or occupied inputs were removed.',
    );
  });
});

describe('describeImportFailure', () => {
  it.each<[string, ImportFailure, string]>([
    ['a file that cannot be read', { code: 'unreadable' }, 'The file could not be read.'],
    ['text that is not JSON', { code: 'invalid-json' }, 'The file is not valid JSON.'],
    [
      'JSON that is not a pipeline file',
      { code: 'not-a-pipeline' },
      'It is not a Pipeline Builder file.',
    ],
    [
      'a file from a newer version',
      { code: 'newer-version', version: 3 },
      'It was saved by a newer version of Pipeline Builder (schema version 3). Reload the page to update the app.',
    ],
    [
      'an invalid field',
      {
        code: 'invalid-pipeline',
        path: 'nodes[0].position.x',
        message: 'Invalid input: expected number, received string',
      },
      'The pipeline is invalid at nodes[0].position.x: Invalid input: expected number, received string.',
    ],
    [
      'an invalid document',
      { code: 'invalid-pipeline', path: '', message: 'Invalid pipeline.' },
      'The pipeline is invalid: Invalid pipeline.',
    ],
    [
      'a node id used twice',
      { code: 'duplicate-id', element: 'node', id: 'prompt' },
      'The id “prompt” is used by two nodes.',
    ],
    [
      'an edge id used twice',
      { code: 'duplicate-id', element: 'edge', id: 'e1' },
      'The id “e1” is used by two edges.',
    ],
  ])('explains %s', (_, failure, description) => {
    expect(describeImportFailure('draft.pipeline.json', failure)).toEqual({
      title: 'Couldn’t import “draft.pipeline.json”',
      description,
    });
  });
});

describe('undoImportAltText', () => {
  it('names the undo shortcut of the platform', () => {
    expect(undoImportAltText(false)).toBe('Press Ctrl+Z to undo the import');
    expect(undoImportAltText(true)).toBe('Press ⌘Z to undo the import');
  });
});
