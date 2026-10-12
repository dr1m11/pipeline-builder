import { describe, expect, it } from 'vitest';

import type { PortType } from '../ports';
import { TRANSFORM_DEFINITION, type TransformOperation } from './transform';

describe('TRANSFORM_DEFINITION', () => {
  it('starts by parsing JSON', () => {
    expect(TRANSFORM_DEFINITION.createData()).toEqual({ operation: 'parse-json', path: '' });
  });

  it.each<[TransformOperation, PortType, PortType]>([
    ['parse-json', 'text', 'json'],
    ['stringify', 'json', 'text'],
    ['trim', 'text', 'text'],
    ['get-field', 'json', 'any'],
  ])('types the ports of "%s" as %s to %s', (operation, input, output) => {
    expect(TRANSFORM_DEFINITION.getPorts({ operation, path: '' })).toEqual({
      inputs: [{ id: 'value', label: 'value', type: input, required: true }],
      outputs: [{ id: 'result', label: 'result', type: output, required: false }],
    });
  });
});
