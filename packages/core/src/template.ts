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

/**
 * Fills the `{{variable}}` placeholders of a template with values by variable name, with the
 * syntax of `extractTemplateVariables`. A placeholder without a value stays as written, and so does
 * one whose name is not an identifier. Values are inserted as they are: placeholders inside them are
 * not filled.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    // Own keys only, so `{{constructor}}` does not pick up `Object.prototype.constructor`.
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    return value ?? placeholder;
  });
}
