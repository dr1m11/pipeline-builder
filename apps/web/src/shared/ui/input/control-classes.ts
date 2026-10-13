/**
 * Look of every text-entry control (Input, Textarea, Select): a bordered surface with a focus ring,
 * drawn in the danger colour while `aria-invalid` is set (Field sets it from its error).
 */
export const CONTROL_CLASSES =
  'w-full rounded-md border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus-visible:outline-danger';
