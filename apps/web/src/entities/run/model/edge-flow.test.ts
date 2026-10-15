import type { RunEvent } from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { edgeFlow } from './edge-flow';
import { applyRunEvents, IDLE_RUN, type RunState } from './run-state';

function runWith(...events: readonly RunEvent[]): RunState {
  return applyRunEvents({ ...IDLE_RUN, status: 'running' }, events);
}

const PROMPT_TO_LLM = { source: 'prompt', sourcePort: 'prompt', target: 'llm' } as const;

describe('edgeFlow', () => {
  it('carries nothing before its source has a value', () => {
    expect(edgeFlow(IDLE_RUN, PROMPT_TO_LLM)).toBe('none');
    const state = runWith(
      { type: 'node-status', nodeId: 'prompt', status: 'running' },
      { type: 'node-status', nodeId: 'llm', status: 'queued' },
    );
    expect(edgeFlow(state, PROMPT_TO_LLM)).toBe('none');
  });

  it('flows while its target works on the value, and has carried it afterwards', () => {
    const sent = runWith(
      { type: 'node-output', nodeId: 'prompt', outputs: { prompt: 'Why?' } },
      { type: 'node-status', nodeId: 'prompt', status: 'done' },
      { type: 'node-status', nodeId: 'llm', status: 'running' },
    );
    expect(edgeFlow(sent, PROMPT_TO_LLM)).toBe('flowing');

    const answered = applyRunEvents(sent, [{ type: 'node-status', nodeId: 'llm', status: 'done' }]);
    expect(edgeFlow(answered, PROMPT_TO_LLM)).toBe('carried');
  });

  it('carries nothing on the branch a Condition did not take', () => {
    const state = runWith({ type: 'node-output', nodeId: 'check', outputs: { true: 'yes' } });

    expect(edgeFlow(state, { source: 'check', sourcePort: 'true', target: 'a' })).toBe('carried');
    expect(edgeFlow(state, { source: 'check', sourcePort: 'false', target: 'b' })).toBe('none');
  });
});
