// @ts-check

/** @type {Record<string, string | string[]>} */
const config = {
  // --no-warn-ignored: staged files ESLint ignores (generated types) must not count as warnings.
  '*.{ts,tsx,mts,cts,js,mjs,cjs}': [
    'eslint --fix --max-warnings=0 --no-warn-ignored',
    'prettier --write',
  ],
  '*.{json,jsonc,md,mdx,css,yml,yaml,html}': 'prettier --write',
};

export default config;
