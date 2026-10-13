import * as z from 'zod';

import type { FieldPresentation, NodeDefinition, NodeFields } from './node-definition';
import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
} from './registry';

/** One value of a choice field. */
export interface FieldOption {
  readonly value: string;
  readonly label: string;
}

/** The control that edits a field, chosen by the field's schema. */
export type FieldControl =
  | { readonly kind: 'text'; readonly multiline: boolean }
  | { readonly kind: 'number'; readonly step: number | undefined }
  | { readonly kind: 'choice'; readonly options: readonly FieldOption[] };

/** A data field of a node, as the properties form shows it. */
export interface NodeField {
  /** Key of the field in the node data. */
  readonly name: string;
  readonly label: string;
  readonly description: string | undefined;
  readonly control: FieldControl;
  /** Whether the field matters for the node's current data; one that does not is hidden. */
  readonly applies: boolean;
}

/** Fields of a node's data in schema order, each with the control that edits it. */
export function getNodeFields(node: PipelineNode): readonly NodeField[] {
  return fieldsOf(node);
}

// Generic over the kind so the definition and the data stay correlated without a cast.
function fieldsOf<K extends NodeKind>(node: NodeOfKind<K>): readonly NodeField[] {
  const definition: NodeDefinition<NodeDataMap[K]> = NODE_DEFINITIONS[node.kind];
  return describeFields(definition, node.data);
}

/** Fields of `data` as described by `definition`. Exported for tests of malformed definitions. */
export function describeFields<Data>(
  definition: NodeDefinition<Data>,
  data: Data,
): readonly NodeField[] {
  const { fields } = definition;
  return Object.entries(definition.dataSchema.shape).map(([name, schema]) => {
    if (!isFieldName(fields, name)) {
      throw new Error(`Field "${name}" of ${definition.title} has no presentation`);
    }
    const presentation: FieldPresentation<Data> = fields[name];
    return {
      name,
      label: presentation.label,
      description: presentation.description,
      control: controlOf(name, schema, presentation),
      applies: presentation.appliesWhen?.(data) ?? true,
    };
  });
}

function isFieldName<Data>(
  fields: NodeFields<Data>,
  name: string,
): name is Extract<keyof Data, string> {
  return Object.hasOwn(fields, name);
}

function controlOf<Data>(
  name: string,
  schema: z.core.$ZodType,
  presentation: FieldPresentation<Data>,
): FieldControl {
  if (schema instanceof z.ZodEnum) {
    return {
      kind: 'choice',
      options: schema.options.map((option) => {
        const value = String(option);
        return { value, label: presentation.optionLabels?.[value] ?? value };
      }),
    };
  }
  if (schema instanceof z.ZodNumber) return { kind: 'number', step: presentation.step };
  if (schema instanceof z.ZodString) {
    return { kind: 'text', multiline: presentation.multiline ?? false };
  }
  throw new Error(`Field "${name}" has a schema the properties form cannot edit`);
}
