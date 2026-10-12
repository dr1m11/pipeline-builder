/** `{{ name }}` where the name is an identifier; surrounding spaces inside the braces are allowed. */
const PLACEHOLDER = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * Names of the `{{variable}}` placeholders in a template, unique, in order of first appearance.
 * Placeholders whose name is not an identifier (`{{ 1st }}`, `{{a-b}}`) are plain text.
 */
export function extractTemplateVariables(template: string): readonly string[] {
  const names = Array.from(template.matchAll(PLACEHOLDER), ([, name]) => name).filter(
    (name) => name !== undefined,
  );
  return [...new Set(names)];
}
