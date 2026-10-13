import { Label, Slot } from 'radix-ui';
import { type ReactElement, type ReactNode, useId } from 'react';

import { cn } from '@/shared/lib/cn';

export interface FieldProps {
  label: string;
  /** Hint below the control; it becomes part of the control's accessible description. */
  description?: ReactNode;
  /** Validation message; marks the control invalid and is added to its description. */
  error?: string;
  /** Id of the control; generated when omitted. */
  id?: string;
  className?: string;
  /** The single control to label: `Input`, `Textarea`, `Select` or any element that takes an `id`. */
  children: ReactElement;
}

/**
 * Labels a form control and wires its hint and error to it: the child gets `id`,
 * `aria-describedby` (description, then error) and `aria-invalid` through Radix `Slot`, so props
 * the child already has, such as a `register()` ref, are kept.
 *
 * The error paragraph is always rendered as a polite live region, so a message that appears while
 * the user types is announced once. Messages present when the field mounts (opening a form that
 * already has errors) are not announced all at once; they are read with the control instead.
 */
export function Field({ label, description, error, id, className, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description === undefined ? null : descriptionId, error ? errorId : null]
    .filter((part) => part !== null)
    .join(' ');

  return (
    <div className={cn('flex flex-col', className)}>
      <Label.Root htmlFor={controlId} className="mb-1 text-sm font-medium text-fg">
        {label}
      </Label.Root>
      <Slot.Root
        id={controlId}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        aria-invalid={error ? true : undefined}
      >
        {children}
      </Slot.Root>
      {description !== undefined && (
        <p id={descriptionId} className="mt-1 text-xs text-fg-muted">
          {description}
        </p>
      )}
      <p id={errorId} aria-live="polite" className="mt-1 text-xs text-danger empty:mt-0">
        {error}
      </p>
    </div>
  );
}
