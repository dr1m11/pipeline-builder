import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

interface Fixtures {
  /** Runs axe against the current page (WCAG 2.1 A/AA) and fails on any violation. */
  expectNoA11yViolations: () => Promise<void>;
  /**
   * Lets console errors whose text matches `pattern` through, for the rest of the test. The
   * browser logs a failed response as an error, so a test that fakes one expects it.
   */
  allowConsoleErrors: (pattern: RegExp) => void;
}

/**
 * Base test for every e2e spec: fails on uncaught page errors and console errors (except those a
 * test allows), and provides an accessibility check.
 */
export const test = base.extend<Fixtures>({
  allowConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      const allowed: RegExp[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        const text = message.text();
        if (message.type() === 'error' && !allowed.some((pattern) => pattern.test(text))) {
          errors.push(`console.error: ${text}`);
        }
      });
      await use((pattern) => {
        allowed.push(pattern);
      });
      expect(errors, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],

  expectNoA11yViolations: async ({ page }, use) => {
    await use(async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  },
});

export { expect };
