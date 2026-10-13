import { describe, expect, it } from 'vitest';

import {
  carriesNodeKind,
  NODE_KIND_MEDIA_TYPE,
  readNodeKind,
  writeNodeKind,
} from './node-kind-transfer';

/** The parts of a DataTransfer the helpers use, backed by a map. */
function transfer(
  entries: Record<string, string> = {},
): Pick<DataTransfer, 'effectAllowed' | 'types' | 'getData' | 'setData'> {
  const data = new Map(Object.entries(entries));
  return {
    effectAllowed: 'uninitialized',
    get types() {
      return [...data.keys()];
    },
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
  };
}

describe('node kind transfer', () => {
  it('carries a node kind from the palette to the drop', () => {
    const dataTransfer = transfer();

    writeNodeKind(dataTransfer, 'llm-call');

    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(carriesNodeKind(dataTransfer)).toBe(true);
    expect(readNodeKind(dataTransfer)).toBe('llm-call');
  });

  it('ignores drags that carry something else', () => {
    const text = transfer({ 'text/plain': 'prompt' });
    const unknown = transfer({ [NODE_KIND_MEDIA_TYPE]: 'webhook' });

    expect(carriesNodeKind(text)).toBe(false);
    expect(readNodeKind(text)).toBeNull();
    expect(readNodeKind(unknown)).toBeNull();
  });
});
