// Messages of field rules. They follow the field's label ("Template: Required"), so they never name it.
export const REQUIRED_MESSAGE = 'Required';
export const NUMBER_MESSAGE = 'Must be a number';

/** Whether a text field is empty or holds only whitespace. */
export function isBlank(value: string): boolean {
  return value.trim() === '';
}
