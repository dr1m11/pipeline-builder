import {
  NODE_DEFINITIONS,
  NODE_LABEL_SCHEMA,
  type NodeKind,
  type PipelineNode,
} from '@pipeline-builder/core';
import * as z from 'zod';

/** What the properties form holds: the node's label and its data fields by name. */
export interface NodeFormValues {
  label: string;
  data: Record<string, unknown>;
}

/** What the properties form checks the values into; only its errors are used. */
export interface NodeFormOutput {
  readonly label: string;
  readonly data: unknown;
}

/** Validates the properties form of one node kind; input is the form, output the checked node. */
export type NodeFormSchema = z.ZodType<NodeFormOutput, NodeFormValues>;

const schemas = new Map<NodeKind, NodeFormSchema>();

/**
 * The resolver schema of a kind's properties form: the label rules and the kind's rules schema, so
 * the form shows the same messages as validation on the canvas. Built once per kind.
 */
export function nodeFormSchema(kind: NodeKind): NodeFormSchema {
  let schema = schemas.get(kind);
  if (schema === undefined) {
    const { rulesSchema } = NODE_DEFINITIONS[kind];
    schema = z.object({
      label: NODE_LABEL_SCHEMA,
      // The form holds fields by name; the kind's rules check what they add up to, and their
      // issues keep their field paths (`data.template`).
      data: z.record(z.string(), z.unknown()).superRefine((data, ctx) => {
        const result = rulesSchema.safeParse(data);
        if (result.success) return;
        for (const { message, path } of result.error.issues) {
          ctx.addIssue({ code: 'custom', message, path });
        }
      }),
    });
    schemas.set(kind, schema);
  }
  return schema;
}

/** The form values that show `node` as it is. */
export function toFormValues(node: PipelineNode): NodeFormValues {
  return { label: node.label, data: { ...node.data } };
}
