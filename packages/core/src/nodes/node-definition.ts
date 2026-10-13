import type { z } from 'zod';

import type { NodePorts } from '../ports';

/**
 * Zod schema of a kind's data: an object schema whose output is the data type. It checks field
 * types only, so every value the editor can hold passes it; `rulesSchema` adds what a run needs.
 */
export type NodeDataSchema<Data> = z.ZodType<Data> & { readonly shape: z.core.$ZodShape };

/** How a field of a kind's data is presented in the properties form. */
export interface FieldPresentation<Data> {
  readonly label: string;
  readonly description?: string;
  /** Text fields: whether the value spans several lines. */
  readonly multiline?: boolean;
  /** Number fields: the step between values. */
  readonly step?: number;
  /** Choice fields: a label for every option value. */
  readonly optionLabels?: Readonly<Record<string, string>>;
  /** Whether the field matters for this data; a field that does not apply is hidden and not checked. */
  readonly appliesWhen?: (data: Data) => boolean;
}

/** Presentation of every field of a kind's data. */
export type NodeFields<Data> = { readonly [K in keyof Data]-?: FieldPresentation<Data> };

/** Behaviour shared by every node of one kind. */
export interface NodeDefinition<Data> {
  /** Name shown in the palette; default node labels are numbered after it ("Prompt 2"). */
  readonly title: string;
  readonly description: string;
  /** Data of a newly created node. Returns a new object on every call. */
  readonly createData: () => Data;
  /**
   * Ports of a node with the given data; some kinds derive them from it (Prompt variables).
   * The result may be a new object on every call: memoize by node data where identity matters.
   */
  readonly getPorts: (data: Data) => NodePorts;
  /** Shape of the data: field types and allowed values. Saved and edited data always match it. */
  readonly dataSchema: NodeDataSchema<Data>;
  /** What a node needs before the pipeline can run (a template that is not blank, a temperature in range). */
  readonly rulesSchema: z.ZodType<Data>;
  /** Labels and hints of the data fields; the form lists the fields in `dataSchema` order. */
  readonly fields: NodeFields<Data>;
}
