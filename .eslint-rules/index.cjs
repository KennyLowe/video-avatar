// Local ESLint plugin bundling Lumo's constitutional-invariant rules.
// Registered in the top-level package.json as `"eslint-plugin-lumo": "file:./.eslint-rules"`.
module.exports = {
  rules: {
    'no-inline-fetch': require('./no-inline-fetch.cjs'),
    'no-string-concat-paths': require('./no-string-concat-paths.cjs'),
  },
};
