import type { NodeField } from '@pipeline-builder/core';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { Field } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

export interface NodeFieldControlProps {
  field: NodeField;
  registration: UseFormRegisterReturn;
  error: string | undefined;
}

/** A labelled control for one data field, chosen by the field's control kind. */
export function NodeFieldControl({ field, registration, error }: NodeFieldControlProps) {
  const { control } = field;
  return (
    <Field label={field.label} description={field.description} error={error}>
      {control.kind === 'choice' ? (
        <Select {...registration}>
          {control.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : control.kind === 'number' ? (
        <Input type="number" step={control.step ?? 'any'} {...registration} />
      ) : control.multiline ? (
        <Textarea {...registration} />
      ) : (
        <Input {...registration} />
      )}
    </Field>
  );
}
