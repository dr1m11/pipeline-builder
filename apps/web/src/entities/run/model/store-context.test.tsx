import { act, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createRunStore, type RunStore } from './run-store';
import { RunStoreProvider } from './RunStoreProvider';
import { useNodeRun, useRunStore } from './store-context';

/** Shows a node's run status and text, and counts its renders in `renders`. */
function NodeRun({ nodeId, renders }: { nodeId: string; renders: Map<string, number> }) {
  const { status, text } = useNodeRun(nodeId);
  renders.set(nodeId, (renders.get(nodeId) ?? 0) + 1);
  return (
    <p>
      {nodeId}: {status} {text}
    </p>
  );
}

function RunStatus() {
  const status = useRunStore((state) => state.status);
  return <p>Run: {status}</p>;
}

function renderNodes(store: RunStore, nodeIds: readonly string[]) {
  const renders = new Map<string, number>();
  render(
    <RunStoreProvider store={store}>
      <RunStatus />
      {nodeIds.map((nodeId) => (
        <NodeRun key={nodeId} nodeId={nodeId} renders={renders} />
      ))}
    </RunStoreProvider>,
  );
  return renders;
}

describe('useRunStore and useNodeRun', () => {
  it('read the run of the provider and follow it', () => {
    const store = createRunStore();
    renderNodes(store, ['llm']);
    expect(screen.getByText('Run: idle')).toBeInTheDocument();
    expect(screen.getByText('llm: idle')).toBeInTheDocument();

    act(() => {
      store.getState().start();
      store.getState().applyEvents([
        { type: 'node-status', nodeId: 'llm', status: 'running' },
        { type: 'node-delta', nodeId: 'llm', text: 'Hello' },
      ]);
    });

    expect(screen.getByText('Run: running')).toBeInTheDocument();
    expect(screen.getByText('llm: running Hello')).toBeInTheDocument();
  });

  it('re-render a node only when its own state changes', () => {
    const store = createRunStore();
    store.getState().start();
    store.getState().applyEvents([
      { type: 'node-status', nodeId: 'a', status: 'running' },
      { type: 'node-status', nodeId: 'b', status: 'running' },
    ]);
    const renders = renderNodes(store, ['a', 'b']);
    const before = { a: renders.get('a'), b: renders.get('b') };

    act(() => {
      store.getState().applyEvents([{ type: 'node-delta', nodeId: 'a', text: 'Hi' }]);
    });
    act(() => {
      store.getState().applyEvents([{ type: 'node-delta', nodeId: 'a', text: ' there' }]);
    });

    expect(screen.getByText('a: running Hi there')).toBeInTheDocument();
    expect(renders.get('a')).toBe((before.a ?? 0) + 2);
    expect(renders.get('b')).toBe(before.b);
  });

  it('fail outside a provider', () => {
    expect(() => renderHook(() => useNodeRun('a'))).toThrow(
      'The run store is used outside RunStoreProvider',
    );
  });
});
