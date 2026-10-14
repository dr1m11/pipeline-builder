import { describe, expect, it } from 'vitest';

import { pasteErrorToast } from './paste-error';

describe('pasteErrorToast', () => {
  it('says nothing about text that is not a pipeline', () => {
    expect(pasteErrorToast({ code: 'invalid-json' })).toBeNull();
    expect(pasteErrorToast({ code: 'not-a-pipeline' })).toBeNull();
  });

  it('asks to update the app for a pipeline of a newer version', () => {
    expect(pasteErrorToast({ code: 'newer-version', version: 3 })).toEqual({
      tone: 'danger',
      title: 'Cannot paste nodes from a newer version',
      description:
        'They were copied in a newer version of the app (schema version 3). Reload this tab to update it, then paste again.',
    });
  });

  it('points at what is wrong with a damaged pipeline', () => {
    expect(
      pasteErrorToast({ code: 'invalid-pipeline', path: 'nodes[0].label', message: 'Too long' }),
    ).toMatchObject({ tone: 'danger', description: 'nodes[0].label: Too long' });
    expect(
      pasteErrorToast({ code: 'invalid-pipeline', path: '', message: 'Invalid pipeline' }),
    ).toMatchObject({ description: 'Invalid pipeline' });
    expect(pasteErrorToast({ code: 'duplicate-id', element: 'edge', id: 'e1' })).toMatchObject({
      title: 'Cannot paste a damaged pipeline',
      description: 'Two edges have the id “e1”.',
    });
  });
});
