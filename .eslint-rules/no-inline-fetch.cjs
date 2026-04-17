// Forbid inline `fetch(...)` anywhere except the typed provider wrappers at
// `src/main/providers/*`. Enforces constitutional Non-negotiable #5
// ("One typed SDK wrapper per provider").
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid inline fetch() outside src/main/providers/. All outbound HTTP must go through a typed provider wrapper.',
    },
    schema: [],
    messages: {
      inlineFetch:
        'Inline fetch() is only permitted inside src/main/providers/. Call a typed provider wrapper instead.',
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, '/');
    const isAllowed = /\/src\/main\/providers\//.test(filename);

    function check(node) {
      if (isAllowed) return;
      const callee = node.callee;
      if (callee.type === 'Identifier' && callee.name === 'fetch') {
        context.report({ node, messageId: 'inlineFetch' });
      }
      if (
        callee.type === 'MemberExpression' &&
        callee.property &&
        callee.property.name === 'fetch' &&
        callee.object &&
        (callee.object.name === 'window' || callee.object.name === 'globalThis')
      ) {
        context.report({ node, messageId: 'inlineFetch' });
      }
    }

    return {
      CallExpression: check,
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Request' && !isAllowed) {
          context.report({ node, messageId: 'inlineFetch' });
        }
      },
    };
  },
};
