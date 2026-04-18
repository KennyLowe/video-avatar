// Flag string-literal concatenation involving path separators. Enforces
// constitutional Non-negotiable #6 ("All filesystem paths are absolute and
// normalized via path.resolve and path.join"). Heuristic and intentionally
// narrow: we flag `'something/' + variable` or `variable + '/something'`
// patterns so the author reaches for `path.join` / `path.resolve`. Exact
// matches on URL literals are ignored.
/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Flag string-literal concatenation that looks like a filesystem path. Use path.join or path.resolve instead.',
    },
    schema: [],
    messages: {
      concatPath:
        'String-concatenated path detected. Use path.join() or path.resolve() instead to stay within Non-negotiable #6.',
    },
  },
  create(context) {
    function looksLikePathLiteral(value) {
      if (typeof value !== 'string') return false;
      // Ignore things that look like URLs or email addresses.
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return false;
      if (/@/.test(value)) return false;
      // A trailing or leading path separator, or an embedded one with a file-like suffix.
      return (
        value.endsWith('/') ||
        value.endsWith('\\') ||
        value.startsWith('/') ||
        value.startsWith('\\') ||
        /[\\/][^\\/]+\.[a-z0-9]+$/i.test(value)
      );
    }

    function isStringLiteralNode(node) {
      return (
        (node.type === 'Literal' && typeof node.value === 'string') ||
        (node.type === 'TemplateLiteral' && node.expressions.length === 0)
      );
    }

    function literalValue(node) {
      if (node.type === 'Literal') return node.value;
      if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
        return node.quasis[0].value.cooked;
      }
      return null;
    }

    return {
      BinaryExpression(node) {
        if (node.operator !== '+') return;
        const left = node.left;
        const right = node.right;
        const leftLit = isStringLiteralNode(left) ? literalValue(left) : null;
        const rightLit = isStringLiteralNode(right) ? literalValue(right) : null;
        if (leftLit !== null && looksLikePathLiteral(leftLit) && !isStringLiteralNode(right)) {
          context.report({ node, messageId: 'concatPath' });
          return;
        }
        if (rightLit !== null && looksLikePathLiteral(rightLit) && !isStringLiteralNode(left)) {
          context.report({ node, messageId: 'concatPath' });
        }
      },
      TemplateLiteral(node) {
        // Flag templates whose static parts contain path separators and at least one
        // interpolated expression — `${root}/something/${name}.ts` etc. Skip
        // templates that begin with an interpolation (first static quasi empty),
        // which is almost always a URL composition like `${BASE_URL}/v1/foo`.
        if (node.expressions.length === 0) return;
        // Skip templates being handed to `new RegExp(...)` — `\s` / `\b` etc.
        // in a regex source look identical to backslashes in Windows paths.
        if (
          node.parent &&
          node.parent.type === 'NewExpression' &&
          node.parent.callee &&
          node.parent.callee.type === 'Identifier' &&
          node.parent.callee.name === 'RegExp'
        ) {
          return;
        }
        const firstStatic = node.quasis[0]?.value.cooked ?? '';
        if (firstStatic === '') return;
        const allStatic = node.quasis.map((q) => q.value.cooked).join('');
        // Skip templates that contain regex-shape escapes (\s, \b, \d, \w, \n,
        // \r, \t) — they're almost never filesystem paths.
        if (/\\[sdwbnrt]/.test(allStatic)) return;
        // Skip templates that contain a URL scheme (`http://`, `s3://`, etc.)
        // anywhere in their static parts — those are URLs, not paths.
        if (/:\/\//.test(allStatic)) return;
        if (/[\\/][^\\/\s]+/.test(allStatic)) {
          context.report({ node, messageId: 'concatPath' });
        }
      },
    };
  },
};
