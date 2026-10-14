import { addNode, createEmptyPipeline, serializePipeline } from '@pipeline-builder/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRAFT_STORAGE_KEY,
  loadDraft,
  saveDraft,
  UNREADABLE_DRAFT_STORAGE_KEY,
} from './draft-storage';

const storage = window.localStorage;

function pipelineWithInput() {
  const pipeline = createEmptyPipeline({ id: 'saved', name: 'Ask a question' });
  return addNode(pipeline, { kind: 'input', id: 'input', position: { x: 40, y: 80 } }).pipeline;
}

function failingWith(name: string) {
  return () => {
    throw new DOMException('Storage refused the operation', name);
  };
}

describe('loadDraft', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('finds nothing when no draft is saved', () => {
    expect(loadDraft()).toEqual({ status: 'empty' });
  });

  it('restores the saved pipeline', () => {
    const pipeline = pipelineWithInput();
    storage.setItem(DRAFT_STORAGE_KEY, serializePipeline(pipeline));

    expect(loadDraft()).toEqual({
      status: 'restored',
      pipeline,
      migratedFrom: null,
      repairs: [],
      backedUp: false,
    });
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('passes on the repairs made while reading the draft and keeps a copy of it', () => {
    const edges = [
      { id: 'lost', source: 'gone', sourcePort: 'value', target: 'input', targetPort: 'value' },
    ];
    const text = serializePipeline({ ...pipelineWithInput(), edges });
    storage.setItem(DRAFT_STORAGE_KEY, text);

    const draft = loadDraft();

    expect(draft).toMatchObject({
      status: 'restored',
      pipeline: { edges: [] },
      repairs: [{ edgeId: 'lost', reason: 'missing-node' }],
      backedUp: true,
    });
    // The draft stays until the next save; the copy outlives it.
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe(text);
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe(text);
  });

  it('restores a repaired draft even when it cannot keep a copy', () => {
    const edges = [
      { id: 'lost', source: 'gone', sourcePort: 'value', target: 'input', targetPort: 'value' },
    ];
    storage.setItem(DRAFT_STORAGE_KEY, serializePipeline({ ...pipelineWithInput(), edges }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('QuotaExceededError'));

    expect(loadDraft()).toMatchObject({
      status: 'restored',
      repairs: [{ edgeId: 'lost', reason: 'missing-node' }],
      backedUp: false,
    });
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('moves a draft it cannot read aside and frees the draft key', () => {
    storage.setItem(DRAFT_STORAGE_KEY, '{"format": "pipeline-builder", "schemaVer');

    expect(loadDraft()).toEqual({
      status: 'unreadable',
      error: { code: 'invalid-json' },
      backedUp: true,
    });
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe(
      '{"format": "pipeline-builder", "schemaVer',
    );
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(loadDraft()).toEqual({ status: 'empty' });
  });

  it('treats a draft from a newer version as unreadable', () => {
    const newer = serializePipeline({ ...pipelineWithInput(), schemaVersion: 99 });
    storage.setItem(DRAFT_STORAGE_KEY, newer);

    expect(loadDraft()).toEqual({
      status: 'unreadable',
      error: { code: 'newer-version', version: 99 },
      backedUp: true,
    });
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe(newer);
  });

  it('leaves an unreadable draft in place when it cannot copy it', () => {
    storage.setItem(DRAFT_STORAGE_KEY, 'not a pipeline');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('QuotaExceededError'));

    expect(loadDraft()).toEqual({
      status: 'unreadable',
      error: { code: 'invalid-json' },
      backedUp: false,
    });
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe('not a pipeline');
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('keeps the copy of an unreadable draft even when the draft cannot be removed', () => {
    storage.setItem(DRAFT_STORAGE_KEY, 'not a pipeline');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(failingWith('SecurityError'));

    expect(loadDraft()).toMatchObject({ status: 'unreadable', backedUp: true });
    expect(storage.getItem(UNREADABLE_DRAFT_STORAGE_KEY)).toBe('not a pipeline');
  });

  it('finds nothing when storage is unavailable', () => {
    storage.setItem(DRAFT_STORAGE_KEY, serializePipeline(pipelineWithInput()));

    expect(loadDraft(null)).toEqual({ status: 'empty' });

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(failingWith('SecurityError'));
    expect(loadDraft()).toEqual({ status: 'empty' });
  });

  it('finds nothing when the browser denies access to localStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(failingWith('SecurityError'));

    expect(loadDraft()).toEqual({ status: 'empty' });
  });
});

describe('saveDraft', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('saves the pipeline as a pipeline file', () => {
    const pipeline = pipelineWithInput();

    expect(saveDraft(pipeline)).toEqual({ ok: true, value: undefined });
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBe(serializePipeline(pipeline));
  });

  it('saves to the storage it is given', () => {
    const pipeline = pipelineWithInput();

    saveDraft(pipeline, window.sessionStorage);

    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBe(serializePipeline(pipeline));
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('reports full storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('QuotaExceededError'));

    expect(saveDraft(pipelineWithInput())).toEqual({ ok: false, error: 'quota-exceeded' });
  });

  it('reports storage that refuses to save for another reason as unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failingWith('SecurityError'));

    expect(saveDraft(pipelineWithInput())).toEqual({ ok: false, error: 'unavailable' });
    expect(saveDraft(pipelineWithInput(), null)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('reports storage as unavailable when the browser denies access to localStorage', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(failingWith('SecurityError'));

    expect(saveDraft(pipelineWithInput())).toEqual({ ok: false, error: 'unavailable' });
  });
});
