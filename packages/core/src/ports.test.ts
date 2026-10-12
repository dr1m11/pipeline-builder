import { describe, expect, it } from 'vitest';

import { arePortTypesCompatible, PORT_TYPES, type PortType } from './ports';

describe('arePortTypesCompatible', () => {
  it('accepts an output feeding an input of the same type', () => {
    for (const type of PORT_TYPES) {
      expect(arePortTypesCompatible(type, type)).toBe(true);
    }
  });

  it('treats "any" as a wildcard on either side', () => {
    for (const type of PORT_TYPES) {
      expect(arePortTypesCompatible('any', type)).toBe(true);
      expect(arePortTypesCompatible(type, 'any')).toBe(true);
    }
  });

  it('rejects every pair of different concrete types', () => {
    const concrete: PortType[] = ['text', 'number', 'json'];
    const pairs = concrete.flatMap((source) =>
      concrete.filter((target) => target !== source).map((target) => [source, target] as const),
    );
    expect(pairs).toHaveLength(6);
    for (const [source, target] of pairs) {
      expect(arePortTypesCompatible(source, target)).toBe(false);
    }
  });
});
