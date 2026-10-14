import { createEmptyPipeline, serializePipeline } from '@pipeline-builder/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DRAFT_STORAGE_KEY } from '../api/draft-storage';
import { type AutosaveOptions, startAutosave } from './autosave';
import { createPipelineStore } from './pipeline-store';

/** Stop functions of the autosaves a test started, so that none outlives it. */
const running: (() => void)[] = [];

function setUp(options: AutosaveOptions = {}) {
  let nextId = 0;
  const store = createPipelineStore(createEmptyPipeline({ id: 'draft', name: 'Draft' }), {
    createId: () => `id-${String((nextId += 1))}`,
  });
  const stop = startAutosave(store, options);
  running.push(stop);
  return {
    store,
    stop,
    addInput: () => store.getState().addNode('input', { x: 0, y: 0 }),
    savedText: () => window.localStorage.getItem(DRAFT_STORAGE_KEY),
    currentText: () => serializePipeline(store.getState().pipeline),
  };
}

function hidePage() {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('startAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const stop of running.splice(0)) stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('saves the pipeline once changes pause', () => {
    const autosave = setUp();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    autosave.addInput();
    vi.advanceTimersByTime(299);
    expect(autosave.savedText()).toBeNull();
    autosave.addInput();
    vi.advanceTimersByTime(299);
    expect(autosave.savedText()).toBeNull();

    vi.advanceTimersByTime(1);
    expect(autosave.savedText()).toBe(autosave.currentText());
    expect(setItem).toHaveBeenCalledOnce();
  });

  it('waits as long as it is told', () => {
    const autosave = setUp({ delayMs: 1000 });

    autosave.addInput();
    vi.advanceTimersByTime(999);
    expect(autosave.savedText()).toBeNull();

    vi.advanceTimersByTime(1);
    expect(autosave.savedText()).toBe(autosave.currentText());
  });

  it('does not save selection, sizes or drag positions', () => {
    const autosave = setUp();
    const node = autosave.addInput();
    vi.runAllTimers();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { store } = autosave;

    store.getState().select({ nodeIds: [node.id] });
    store.getState().setMeasured(new Map([[node.id, { width: 240, height: 120 }]]));
    store.getState().dragNodes(new Map([[node.id, { x: 50, y: 50 }]]));
    vi.runAllTimers();

    expect(setItem).not.toHaveBeenCalled();
  });

  it('saves at once when the page is closed', () => {
    const autosave = setUp();

    autosave.addInput();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));

    expect(autosave.savedText()).toBe(autosave.currentText());
  });

  it('saves at once when the page is hidden, not when it is shown', () => {
    const autosave = setUp();

    autosave.addInput();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(autosave.savedText()).toBeNull();

    hidePage();
    expect(autosave.savedText()).toBe(autosave.currentText());
  });

  it('saves a pipeline only once', () => {
    const autosave = setUp();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    expect(setItem).not.toHaveBeenCalled();

    autosave.addInput();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    vi.runAllTimers();
    hidePage();

    expect(setItem).toHaveBeenCalledOnce();
  });

  it('stops saving, dropping a change that is still waiting', () => {
    const autosave = setUp();

    autosave.addInput();
    autosave.stop();
    vi.runAllTimers();
    autosave.addInput();
    vi.runAllTimers();
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    hidePage();

    expect(autosave.savedText()).toBeNull();
  });

  it('reports each save that fails', () => {
    const onError = vi.fn();
    const autosave = setUp({ onError });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    autosave.addInput();
    vi.runAllTimers();
    autosave.addInput();
    vi.runAllTimers();

    expect(onError.mock.calls).toEqual([['quota-exceeded'], ['quota-exceeded']]);
  });

  it('saves to the storage it is given', () => {
    const autosave = setUp({ storage: window.sessionStorage });

    autosave.addInput();
    vi.runAllTimers();

    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBe(autosave.currentText());
    expect(autosave.savedText()).toBeNull();
  });
});
