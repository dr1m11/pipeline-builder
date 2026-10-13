import { zodResolver } from '@hookform/resolvers/zod';
import { findNode, type NodeField, type PipelineNode } from '@pipeline-builder/core';
import { type ChangeEvent, useCallback, useEffect, useRef } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';

import { usePipelineStoreApi } from '@/entities/pipeline';

import {
  type NodeFormOutput,
  nodeFormSchema,
  type NodeFormValues,
  toFormValues,
} from '../lib/form-schema';

const DATA_PREFIX = 'data.';

/** The properties form of one node, wired to the pipeline store. */
export interface NodeForm {
  /** Props for the name control. */
  readonly label: UseFormRegisterReturn<'label'>;
  /** Props for the control of a data field. */
  readonly field: (field: NodeField) => UseFormRegisterReturn<`data.${string}`>;
  /** The message of the rule the name (`'label'`) or a data field breaks, if any. */
  readonly errorOf: (name: 'label' | `data.${string}`) => string | undefined;
  /** The `<form>`'s change handler: sends the changed control's value to the pipeline. */
  readonly onChange: (event: ChangeEvent<HTMLFormElement>) => void;
  /** Moves focus to the control of data field `field`. */
  readonly focusField: (field: string) => void;
}

/**
 * Edits `node` in a React Hook Form form checked by the kind's rules. Every change goes to the
 * pipeline at once; the store keeps what fits the kind's data, so a draft that is not a value yet
 * (an empty number field) stays in the form. Rule messages show from the start.
 *
 * The form is not driven by the node: that would overwrite what the user is typing (the store trims
 * labels). It resets only when the node's data or label change to something it did not save, such
 * as an undo. Mount one form per node (`key` by node id).
 */
export function useNodeForm(node: PipelineNode): NodeForm {
  const store = usePipelineStoreApi();
  const { register, getValues, getFieldState, formState, reset, trigger, setFocus } = useForm<
    NodeFormValues,
    unknown,
    NodeFormOutput
  >({
    resolver: zodResolver(nodeFormSchema(node.kind)),
    mode: 'onChange',
    defaultValues: toFormValues(node),
  });

  // The data and label that the form itself last produced in the pipeline.
  const savedRef = useRef({ data: node.data, label: node.label });

  useEffect(() => {
    void trigger();
  }, [trigger]);

  useEffect(() => {
    if (node.data === savedRef.current.data && node.label === savedRef.current.label) return;
    savedRef.current = { data: node.data, label: node.label };
    reset(toFormValues(node));
    void trigger();
  }, [node, reset, trigger]);

  // Stable, so an effect that focuses a field runs only when the requested field changes.
  const focusField = useCallback(
    (field: string) => {
      setFocus(`data.${field}`);
    },
    [setFocus],
  );

  return {
    label: register('label'),
    field: ({ name, control }) =>
      register(`data.${name}`, { valueAsNumber: control.kind === 'number' }),
    errorOf: (name) => getFieldState(name, formState).error?.message,
    // Bubbles up after React Hook Form's own handler on the control has stored the new value.
    onChange: ({ target }) => {
      const name = controlName(target);
      const actions = store.getState();
      if (name === 'label') {
        actions.renameNode(node.id, getValues('label'));
      } else if (name?.startsWith(DATA_PREFIX)) {
        const field = name.slice(DATA_PREFIX.length);
        actions.updateNodeData(node.id, { [field]: getValues(`data.${field}`) });
      } else {
        return;
      }
      const current = findNode(store.getState().pipeline, node.id);
      if (current !== undefined) savedRef.current = { data: current.data, label: current.label };
      // A change can make another field apply or break a rule (a Transform's operation and path).
      void trigger();
    },
    focusField,
  };
}

function controlName(target: EventTarget): string | undefined {
  const isControl =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;
  return isControl ? target.name : undefined;
}
