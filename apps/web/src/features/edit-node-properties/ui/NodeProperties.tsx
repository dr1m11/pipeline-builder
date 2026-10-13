import { getNodeFields, type PipelineNode } from '@pipeline-builder/core';
import { useEffect } from 'react';

import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';

import { useNodeForm } from '../model/use-node-form';
import { NodeFieldControl } from './NodeFieldControl';

export interface NodePropertiesProps {
  node: PipelineNode;
  /** A data field to focus, e.g. one whose problem the user picked; focused once it is set. */
  focusField?: string | undefined;
  /** Called once `focusField` has been focused, so the request can be cleared. */
  onFieldFocused?: () => void;
}

/**
 * The properties form of a node: its name and every data field that applies to its current data,
 * generated from the kind's schema. Changes reach the pipeline as they are typed. Give it
 * `key={node.id}` so that another node gets a fresh form.
 */
export function NodeProperties({ node, focusField, onFieldFocused }: NodePropertiesProps) {
  const form = useNodeForm(node);
  const fields = getNodeFields(node).filter((field) => field.applies);
  const { focusField: focusControl } = form;

  // Runs after the controls are mounted and registered, also for a form that mounts with a request.
  useEffect(() => {
    if (focusField === undefined) return;
    focusControl(focusField);
    onFieldFocused?.();
  }, [focusField, focusControl, onFieldFocused]);

  return (
    // Nothing to submit: every change is applied as it is made.
    <form
      noValidate
      className="flex flex-col gap-3"
      onChange={form.onChange}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <Field label="Name" error={form.errorOf('label')}>
        <Input autoComplete="off" {...form.label} />
      </Field>
      {fields.map((field) => (
        <NodeFieldControl
          key={field.name}
          field={field}
          registration={form.field(field)}
          error={form.errorOf(`data.${field.name}`)}
        />
      ))}
    </form>
  );
}
